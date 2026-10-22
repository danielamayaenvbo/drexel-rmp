import { lookupProfessorViaRmp } from "@drexel-rmp/shared";
import { isProfessorInsights, type ProfessorRating } from "@drexel-rmp/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createWorkersAiProvider, generateInsights } from "./insights";
import { UnavailableReviewProvider } from "./reviewProvider";

type Env = {
  Bindings: {
    RMP_CACHE: KVNamespace;
    AI?: Ai;
    ALLOWED_ORIGIN?: string;
    AI_INSIGHTS_ENABLED?: string;
    REVIEW_DATA_SOURCE?: string;
    AI_MODEL?: string;
    AI_DAILY_LIMIT?: string;
  };
};

const POSITIVE_TTL_SECONDS = 7 * 24 * 60 * 60; // found: 7 days
const NEGATIVE_TTL_SECONDS = 24 * 60 * 60; // not_found: 1 day
const INSIGHTS_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_DAILY_LIMIT = 25;

const app = new Hono<Env>();
// Hygiene, not access control: the extension's service worker is exempt from CORS
// via host_permissions, and CORS never stops non-browser clients. This only stops
// arbitrary websites from reading Worker responses from their pages.
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN;
      // `allowed &&` guard: Hono passes "" when there's no Origin header, and "" === "" must not match.
      return allowed && origin === allowed ? origin : null;
    },
  }),
);

app.get("/prof", async (c) => {
  const name = c.req.query("name")?.trim().toLowerCase();
  if (!name) return c.json({ error: "name required" }, 400);

  const key = `prof:${name}`;
  let cached: unknown = null;
  try {
    cached = await c.env.RMP_CACHE.get(key, "json");
  } catch {
    // KV read failure degrades to a cache miss — never a user-facing error
  }
  if (cached) return c.json(cached);

  let result: Awaited<ReturnType<typeof lookupProfessorViaRmp>>;
  try {
    result = await lookupProfessorViaRmp(name);
  } catch {
    return c.json({ error: "rmp_unavailable" }, 502);
  }

  try {
    await c.env.RMP_CACHE.put(key, JSON.stringify(result), {
      expirationTtl: result.status === "found" ? POSITIVE_TTL_SECONDS : NEGATIVE_TTL_SECONDS,
    });
  } catch {
    // cache-write failure must not block serving a successful lookup
  }
  return c.json(result);
});

app.get("/api/professors/:professorId/insights", async (c) => {
  const professorId = c.req.param("professorId");
  if (!/^\d{1,12}$/.test(professorId)) return c.json({ error: "invalid_professor_id" }, 400);
  if (c.env.AI_INSIGHTS_ENABLED !== "true") return c.json({ status: "unavailable", reason: "ai_disabled" }, 503);
  if (c.env.REVIEW_DATA_SOURCE !== "authorized") {
    return c.json({ status: "unavailable", reason: "review_data_unavailable" }, 503);
  }
  if (!c.env.AI) return c.json({ status: "unavailable", reason: "ai_disabled" }, 503);

  const cacheKey = `insights:v1:${professorId}`;
  try {
    const cached = await c.env.RMP_CACHE.get(cacheKey, "json");
    if (isProfessorInsights(cached)) return c.json({ status: "available", insights: cached });
  } catch {
    // A cache miss is safe; generation remains on-demand.
  }

  const clientKey = `insights-usage:${new Date().toISOString().slice(0, 10)}:${clientKeyFor(c.req.raw)}`;
  const limit = parsePositiveInt(c.env.AI_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  try {
    const count = Number.parseInt((await c.env.RMP_CACHE.get(clientKey)) ?? "0", 10);
    if (count >= limit) return c.json({ status: "quota_exhausted" }, 429);
    await c.env.RMP_CACHE.put(clientKey, String(count + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  } catch {
    // Usage accounting is best effort. It is not claimed to be a global quota.
  }

  const cachedRating = await c.env.RMP_CACHE.get(`prof:${professorId}`, "json").catch(() => null);
  const rating = isRating(cachedRating) ? cachedRating : null;
  const provider = new UnavailableReviewProvider();
  const reviews = await provider.getReviews(professorId);
  if (reviews.length === 0) return c.json({ status: "unavailable", reason: "review_data_unavailable" }, 503);

  try {
    const insights = await withTimeout(
      generateInsights(
        professorId,
        rating?.name ?? "Professor",
        rating?.rating ?? null,
        reviews,
        createWorkersAiProvider(c.env.AI, c.env.AI_MODEL || DEFAULT_AI_MODEL),
      ),
      20_000,
    );
    if (!insights) return c.json({ status: "unavailable", reason: "insufficient_reviews" }, 422);
    await c.env.RMP_CACHE.put(cacheKey, JSON.stringify(insights), { expirationTtl: INSIGHTS_TTL_SECONDS });
    return c.json({ status: "available", insights });
  } catch (error) {
    console.error("AI insights generation failed", error);
    return c.json({ error: "ai_unavailable" }, 503);
  }
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientKeyFor(request: Request): string {
  const forwarded = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "anonymous";
  return forwarded.slice(0, 80).replace(/[^a-zA-Z0-9:._-]/g, "_");
}

function isRating(value: unknown): value is ProfessorRating {
  return !!value && typeof value === "object" && typeof (value as ProfessorRating).name === "string";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI request timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default app;
