import { DREXEL_LEGACY_SCHOOL_ID, type InsightsResponse, type LookupResult } from "@drexel-rmp/shared";
import { attachTooltip } from "./tooltip";
import { renderInsightsPanel } from "./insights";
import type { ProfessorRating } from "@drexel-rmp/shared";

const STYLES = `
  :host { all: initial; }
  .badge {
    display: inline-block; padding: 1px 6px;
    border-radius: 9px; font: 600 11px/1.5 system-ui, sans-serif;
    cursor: pointer; vertical-align: middle; white-space: nowrap;
  }
  .good { background: #dcf5dc; color: #146c2e; }
  .ok   { background: #fff3cd; color: #8a6d00; }
  .bad  { background: #fde2e1; color: #a12622; }
  .none { background: #ececec; color: #666; font-weight: 400; }
  a { text-decoration: none; color: inherit; }
  .tooltip {
    position: fixed; z-index: 2147483647; width: max-content; max-width: 260px;
    background: #1f1f1f; color: #f5f5f5; border-radius: 8px; padding: 10px 12px;
    font: 400 12px/1.6 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  }
  .tip-name { font-weight: 700; margin-bottom: 4px; }
  .tip-link { display: block; margin-top: 6px; color: #8ab4f8; }
  .insights-button { margin: 5px 0 0; border: 0; border-radius: 5px; padding: 4px 7px; background: #d9b44a; color: #151515; font: 600 11px system-ui, sans-serif; cursor: pointer; }
  .insights-button:focus-visible, .insights-close:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
  .insights-panel { position: fixed; z-index: 2147483647; width: 280px; max-width: calc(100vw - 16px); max-height: 70vh; overflow: auto; background: #fff; color: #202124; border: 1px solid #d8d8d8; border-radius: 9px; padding: 10px; box-shadow: 0 5px 22px rgba(0,0,0,.25); font: 400 12px/1.45 system-ui, sans-serif; }
  .insights-header { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
  .insights-title { font-weight: 700; }
  .insights-close { border: 0; background: transparent; color: #555; cursor: pointer; padding: 0; }
  .insights-meta { color: #666; font-size: 11px; margin-top: 4px; }
  .insights-summary { margin: 8px 0; }
  .insights-section-title { font-weight: 700; margin-top: 9px; }
  .insights-panel ul { margin: 3px 0 0; padding-left: 18px; }
  .theme-explanation { margin: 3px 0 5px; color: #444; }
  .insights-categories { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-top: 3px; }
  .category { color: #444; }
`;

/** Tier from the value as displayed (1 decimal), so a shown "4.0" is never colored as 3.x. */
function tierClass(displayed: number): string {
  if (displayed >= 4) return "good";
  if (displayed >= 3) return "ok";
  return "bad";
}

/** Badge host element (shadow DOM) to append after an instructor name. */
export function createBadge(
  result: LookupResult,
  queriedName: string,
  fetchInsights?: (professorId: number) => Promise<InsightsResponse>,
  save?: (rating: ProfessorRating) => Promise<void>,
): HTMLElement {
  const host = document.createElement("span");
  host.className = "rmp-badge-host";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);

  const link = document.createElement("a");
  link.target = "_blank";
  link.rel = "noopener";
  const badge = document.createElement("span");

  if (result.status === "found") {
    const { rating } = result;
    const displayed = Math.round(rating.rating * 10) / 10;
    badge.className = `badge ${tierClass(displayed)}`;
    badge.textContent = `★ ${displayed.toFixed(1)}`;
    link.href = rating.rmpUrl;
    link.setAttribute("aria-label", `Rate My Professors: ${displayed.toFixed(1)} out of 5`);
    attachTooltip(shadow, badge, link, rating);
    if (fetchInsights) {
      const insightsButton = document.createElement("button");
      insightsButton.type = "button";
      insightsButton.className = "insights-button";
      insightsButton.textContent = "✨ AI Insights";
      insightsButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        insightsButton.disabled = true;
        insightsButton.textContent = "Loading...";
        try {
          const response = await fetchInsights(rating.legacyId);
          renderInsightsPanel(shadow, rating.name, displayed, response, () => {
            shadow.querySelector(".insights-panel")?.remove();
          });
        } catch {
          renderInsightsPanel(shadow, rating.name, displayed, { status: "unavailable", reason: "ai_disabled" }, () => {
            shadow.querySelector(".insights-panel")?.remove();
          });
        } finally {
          insightsButton.disabled = false;
          insightsButton.textContent = "✨ AI Insights";
        }
      });
      shadow.append(insightsButton);
    }
    if (save) {
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "insights-button";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveButton.disabled = true;
        try {
          await save(rating);
          saveButton.textContent = "Saved";
        } catch {
          saveButton.textContent = "Save failed";
        }
      });
      shadow.append(saveButton);
    }
  } else {
    badge.className = "badge none";
    badge.textContent = "n/a";
    badge.title = `No confident Rate My Professors match for ${queriedName}`;
    const search = new URL(`https://www.ratemyprofessors.com/search/professors/${DREXEL_LEGACY_SCHOOL_ID}`);
    search.searchParams.set("q", queriedName);
    link.href = search.toString();
  }

  link.appendChild(badge);
  shadow.appendChild(link);
  return host;
}
