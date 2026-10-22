# drexel-rmp-worker

Cache proxy for RMP lookups. Deployed at:

    https://drexel-rmp-worker.mlhv.workers.dev

- `GET /prof?name=<first last>` → `LookupResult` JSON (see @drexel-rmp/shared)
- `GET /api/professors/:professorId/insights` → validated AI insights when explicitly enabled
- KV: `RMP_CACHE` (id `2e1d7c3f7219480fadaa9a4d2cb31e92`), keys `prof:<lowercased name>`, TTL 7d found / 1d not_found
- Deploy: `pnpm -F @drexel-rmp/worker run deploy` (requires `wrangler login`)

## AI Insights safety

The endpoint is disabled unless both `AI_INSIGHTS_ENABLED="true"` and
`REVIEW_DATA_SOURCE="authorized"` are set. The repository currently has no
authorized review-text source: the RMP search query supplies ratings and
counts only. The default provider therefore returns an unavailable state and
never scrapes or invents reviews.

When a permitted provider is added, bind Workers AI as `AI` and optionally set
`AI_MODEL` (default `@cf/meta/llama-3.1-8b-instruct`) and `AI_DAILY_LIMIT`
(default `25`). The Worker uses the Workers AI free daily neuron allocation
where available, but Cloudflare account billing is configuration-dependent;
there is no paid fallback. KV caches validated insights for seven days and
stores a best-effort per-client daily counter. It is not a globally atomic
quota. Review text is bounded, treated as untrusted prompt data, and model
output is schema-validated before it is cached.
