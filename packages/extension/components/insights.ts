import type { InsightsResponse, ProfessorInsights, SentimentLabel } from "@drexel-rmp/shared";

const LABEL_TEXT: Record<SentimentLabel, string> = {
  positive: "Positive",
  mixed: "Mixed",
  negative: "Negative",
  insufficient_evidence: "Insufficient evidence",
};

function text(value: string, className?: string): HTMLElement {
  const element = document.createElement("div");
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function renderThemes(parent: HTMLElement, title: string, themes: ProfessorInsights["positives"]): void {
  if (themes.length === 0) return;
  parent.append(text(title, "insights-section-title"));
  const list = document.createElement("ul");
  for (const theme of themes) {
    const item = document.createElement("li");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = theme.theme;
    details.append(summary, text(theme.explanation, "theme-explanation"));
    item.append(details);
    list.append(item);
  }
  parent.append(list);
}

export function renderInsightsPanel(
  shadow: ShadowRoot,
  professorName: string,
  rating: number,
  response: InsightsResponse,
  close: () => void,
): void {
  shadow.querySelector(".insights-panel")?.remove();
  const panel = document.createElement("section");
  panel.className = "insights-panel";
  panel.setAttribute("aria-label", "AI Review Insights");
  const header = document.createElement("div");
  header.className = "insights-header";
  header.append(text(`AI Insights: ${professorName}`, "insights-title"));
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "insights-close";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", close);
  header.append(closeButton);
  panel.append(header);

  if (response.status !== "available") {
    panel.append(text(
      response.status === "unavailable" && response.reason === "review_data_unavailable"
        ? "Insights are unavailable because no authorized review-text source is configured."
        : response.status === "unavailable" && response.reason === "ai_disabled"
          ? "AI Insights are not enabled for this deployment."
          : "Insights are temporarily unavailable. Please try again later.",
      "insights-message",
    ));
    shadow.append(panel);
    return;
  }

  const insights = response.insights;
  panel.append(
    text(`${rating.toFixed(1)} / 5 · ${insights.reviewsAnalyzed} reviews analyzed`, "insights-meta"),
    text(insights.summary, "insights-summary"),
  );
  renderThemes(panel, "What students like", insights.positives);
  renderThemes(panel, "Common complaints", insights.negatives);
  panel.append(text("Categories", "insights-section-title"));
  const categories = document.createElement("div");
  categories.className = "insights-categories";
  for (const [name, label] of Object.entries(insights.categories)) {
    categories.append(text(`${name}: ${LABEL_TEXT[label as SentimentLabel]}`, "category"));
  }
  panel.append(categories, text(`Generated ${new Date(insights.generatedAt).toLocaleDateString()}`, "insights-meta"));
  shadow.append(panel);
}
