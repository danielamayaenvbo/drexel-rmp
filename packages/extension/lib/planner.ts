import type { ProfessorRating } from "@drexel-rmp/shared";
import { browser } from "wxt/browser";

type SavedProfessor = Pick<ProfessorRating, "legacyId" | "name" | "rating" | "difficulty" | "wouldTakeAgain" | "numRatings" | "rmpUrl"> & {
  savedAt: string;
};

type PlannerState = {
  saved: SavedProfessor[];
  minRating: number | null;
  maxDifficulty: number | null;
};

type VisibleProfessor = Pick<SavedProfessor, "legacyId" | "name" | "rating" | "difficulty" | "wouldTakeAgain" | "numRatings">;

const visible = new Map<number, VisibleProfessor>();
let controls: HTMLElement | undefined;

async function plannerMessage<T>(message: object): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

function numberOrNull(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function panel(title: string): HTMLElement {
  document.getElementById("rmp-planner-panel")?.remove();
  const element = document.createElement("section");
  element.id = "rmp-planner-panel";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", title);
  element.style.cssText = "position:fixed;right:16px;top:52px;z-index:2147483647;width:330px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;background:#fff;color:#202124;border:1px solid #d8d8d8;border-radius:9px;padding:12px;box-shadow:0 5px 22px rgba(0,0,0,.25);font:14px/1.45 system-ui,sans-serif";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.style.cssText = "float:right;border:0;background:transparent;cursor:pointer";
  close.addEventListener("click", () => element.remove());
  element.append(heading, close);
  document.body.append(element);
  return element;
}

function text(value: string): HTMLElement {
  const element = document.createElement("p");
  element.textContent = value;
  return element;
}

async function showSummary(): Promise<void> {
  const values = [...visible.values()];
  const element = panel("Schedule rating summary");
  if (values.length === 0) {
    element.append(text("No matched instructors are visible on this page yet."));
    return;
  }
  const average = values.reduce((total, rating) => total + rating.rating, 0) / values.length;
  const difficulty = values.reduce((total, rating) => total + rating.difficulty, 0) / values.length;
  element.append(
    text(`${values.length} matched instructor${values.length === 1 ? "" : "s"} visible`),
    text(`Average rating: ${average.toFixed(1)} / 5`),
    text(`Average difficulty: ${difficulty.toFixed(1)} / 5`),
    text("These values are a quick comparison aid, not a recommendation."),
  );
}

async function showSaved(): Promise<void> {
  const state = await plannerMessage<PlannerState>({ type: "GET_PLANNER_STATE" });
  const element = panel("Saved professors");
  if (state.saved.length === 0) {
    element.append(text("Use Save beside a rating badge to build your shortlist."));
    return;
  }
  const list = document.createElement("ul");
  for (const professor of state.saved.sort((a, b) => b.rating - a.rating)) {
    const item = document.createElement("li");
    item.textContent = `${professor.name}: ${professor.rating.toFixed(1)} / 5, difficulty ${professor.difficulty.toFixed(1)}${professor.wouldTakeAgain === null ? "" : `, ${professor.wouldTakeAgain}% would take again`}`;
    list.append(item);
  }
  element.append(list);
}

async function showFilters(): Promise<void> {
  const state = await plannerMessage<PlannerState>({ type: "GET_PLANNER_STATE" });
  const element = panel("Instructor filters");
  element.append(text("Dim badges below a rating or above a difficulty threshold. Leave a field blank to disable that filter."));
  const rating = document.createElement("input");
  rating.type = "number";
  rating.min = "0";
  rating.max = "5";
  rating.step = "0.1";
  rating.placeholder = "Minimum rating";
  rating.value = state.minRating?.toString() ?? "";
  const difficulty = document.createElement("input");
  difficulty.type = "number";
  difficulty.min = "0";
  difficulty.max = "5";
  difficulty.step = "0.1";
  difficulty.placeholder = "Maximum difficulty";
  difficulty.value = state.maxDifficulty?.toString() ?? "";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Apply filters";
  save.addEventListener("click", async () => {
    await plannerMessage({
      type: "SET_PLANNER_FILTERS",
      minRating: numberOrNull(rating.value),
      maxDifficulty: numberOrNull(difficulty.value),
    });
    document.querySelectorAll<HTMLElement>("[data-rmp-filtered]").forEach((host) => host.removeAttribute("data-rmp-filtered"));
    window.location.reload();
  });
  element.append(rating, difficulty, save);
}

export function ensurePlanningControls(): void {
  if (controls) return;
  controls = document.createElement("div");
  controls.id = "rmp-planner-controls";
  controls.style.cssText = "position:fixed;right:16px;top:12px;z-index:2147483647;display:flex;gap:5px;padding:6px;background:#fff;border:1px solid #d8d8d8;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.18);font:12px system-ui,sans-serif";
  for (const [label, action] of [["Summary", showSummary], ["Saved", showSaved], ["Filters", showFilters]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => void action());
    controls.append(button);
  }
  document.body.append(controls);
}

export function registerVisibleProfessor(rating: ProfessorRating): void {
  visible.set(rating.legacyId, rating);
  ensurePlanningControls();
}

export async function saveProfessor(rating: ProfessorRating): Promise<void> {
  await plannerMessage({ type: "SAVE_PROFESSOR", rating });
}

export async function applyFilters(host: HTMLElement, rating: ProfessorRating): Promise<void> {
  const state = await plannerMessage<PlannerState>({ type: "GET_PLANNER_STATE" });
  const filtered = (state.minRating !== null && rating.rating < state.minRating) ||
    (state.maxDifficulty !== null && rating.difficulty > state.maxDifficulty);
  if (filtered) {
    host.dataset.rmpFiltered = "true";
    host.style.opacity = "0.35";
    host.title = "Does not match your ProfessorView filters";
  }
}
