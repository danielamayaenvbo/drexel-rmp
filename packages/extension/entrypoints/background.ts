import { lookupProfessorViaRmp } from "@drexel-rmp/shared";
import { browser } from "wxt/browser";
import { getCached, setCached } from "@/lib/cache";
import { DIRECT_TIMEOUT_MS, WORKER_TIMEOUT_MS, WORKER_URL } from "@/lib/config";
import { createLookupService } from "@/lib/lookup";
import { createInsightsFetcher, createWorkerFetcher, withTimeout } from "@/lib/workerClient";
import type { ProfessorRating } from "@drexel-rmp/shared";

type SavedProfessor = ProfessorRating & { savedAt: string };
type PlannerState = { saved: SavedProfessor[]; minRating: number | null; maxDifficulty: number | null };
const PLANNER_STATE_KEY = "planner-state";

async function getPlannerState(): Promise<PlannerState> {
  const stored = await browser.storage.local.get(PLANNER_STATE_KEY);
  const value = stored[PLANNER_STATE_KEY] as Partial<PlannerState> | undefined;
  return {
    saved: Array.isArray(value?.saved) ? value.saved : [],
    minRating: typeof value?.minRating === "number" ? value.minRating : null,
    maxDifficulty: typeof value?.maxDifficulty === "number" ? value.maxDifficulty : null,
  };
}

async function setPlannerState(state: PlannerState): Promise<void> {
  await browser.storage.local.set({ [PLANNER_STATE_KEY]: state });
}

export default defineBackground(() => {
  const service = createLookupService({
    getCached,
    setCached,
    fetchFromWorker: createWorkerFetcher(WORKER_URL, WORKER_TIMEOUT_MS),
    fetchDirect: (name) => lookupProfessorViaRmp(name, withTimeout(fetch, DIRECT_TIMEOUT_MS)),
  });
  const fetchInsights = createInsightsFetcher(WORKER_URL, WORKER_TIMEOUT_MS);

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const msg = message as { type?: string; name?: string; professorId?: number };
    if (msg?.type === "LOOKUP_PROFESSOR" && typeof msg.name === "string") {
      service
        .lookup(msg.name)
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true; // keep the message channel open for the async response
    }
    if (msg?.type === "GET_PROFESSOR_INSIGHTS" && typeof msg.professorId === "number") {
      fetchInsights(msg.professorId).then(sendResponse).catch(() => sendResponse({ status: "unavailable", reason: "ai_disabled" }));
      return true;
    }
    if (msg?.type === "GET_PLANNER_STATE") {
      getPlannerState().then(sendResponse).catch(() => sendResponse({ saved: [], minRating: null, maxDifficulty: null }));
      return true;
    }
    if (msg?.type === "SAVE_PROFESSOR" && msg.rating && typeof msg.rating === "object") {
      getPlannerState().then(async (state) => {
        const rating = msg.rating as ProfessorRating;
        state.saved = [{ ...rating, savedAt: new Date().toISOString() }, ...state.saved.filter((saved) => saved.legacyId !== rating.legacyId)];
        await setPlannerState(state);
        sendResponse({ saved: true });
      }).catch(() => sendResponse({ saved: false }));
      return true;
    }
    if (msg?.type === "SET_PLANNER_FILTERS") {
      getPlannerState().then(async (state) => {
        state.minRating = typeof msg.minRating === "number" ? msg.minRating : null;
        state.maxDifficulty = typeof msg.maxDifficulty === "number" ? msg.maxDifficulty : null;
        await setPlannerState(state);
        sendResponse({ saved: true });
      }).catch(() => sendResponse({ saved: false }));
      return true;
    }
  });
});
