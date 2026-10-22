export type SentimentLabel = "positive" | "mixed" | "negative" | "insufficient_evidence";

export interface InsightTheme {
  theme: string;
  explanation: string;
  supportingReviewIds: string[];
}

export interface ProfessorInsights {
  professorId: string;
  professorName: string;
  rating: number | null;
  reviewsAnalyzed: number;
  generatedAt: string;
  summary: string;
  positives: InsightTheme[];
  negatives: InsightTheme[];
  categories: {
    clarity: SentimentLabel;
    workload: SentimentLabel;
    exams: SentimentLabel;
    grading: SentimentLabel;
    accessibility: SentimentLabel;
  };
  evidence: Record<string, string>;
}

export type InsightsResponse =
  | { status: "available"; insights: ProfessorInsights }
  | { status: "unavailable"; reason: "review_data_unavailable" | "ai_disabled" | "insufficient_reviews" }
  | { status: "rate_limited" | "quota_exhausted" };

const LABELS = new Set<SentimentLabel>(["positive", "mixed", "negative", "insufficient_evidence"]);

function isTheme(value: unknown): value is InsightTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.theme === "string" &&
    theme.theme.length > 0 &&
    theme.theme.length <= 120 &&
    typeof theme.explanation === "string" &&
    theme.explanation.length > 0 &&
    theme.explanation.length <= 500 &&
    Array.isArray(theme.supportingReviewIds) &&
    theme.supportingReviewIds.every((id) => typeof id === "string")
  );
}

export function isProfessorInsights(value: unknown): value is ProfessorInsights {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const categories = v.categories;
  if (!categories || typeof categories !== "object") return false;
  const c = categories as Record<string, unknown>;
  const requiredCategories = ["clarity", "workload", "exams", "grading", "accessibility"];
  return (
    typeof v.professorId === "string" &&
    typeof v.professorName === "string" &&
    (typeof v.rating === "number" || v.rating === null) &&
    typeof v.reviewsAnalyzed === "number" &&
    Number.isInteger(v.reviewsAnalyzed) &&
    v.reviewsAnalyzed >= 0 &&
    typeof v.generatedAt === "string" &&
    typeof v.summary === "string" &&
    v.summary.length >= 1 &&
    v.summary.length <= 1200 &&
    Array.isArray(v.positives) &&
    v.positives.length <= 3 &&
    v.positives.every(isTheme) &&
    Array.isArray(v.negatives) &&
    v.negatives.length <= 3 &&
    v.negatives.every(isTheme) &&
    requiredCategories.every((key) => typeof c[key] === "string" && LABELS.has(c[key] as SentimentLabel)) &&
    !!v.evidence &&
    typeof v.evidence === "object"
  );
}

export function isInsightsResponse(value: unknown): value is InsightsResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.status === "available") return isProfessorInsights(v.insights);
  if (v.status === "rate_limited" || v.status === "quota_exhausted") return true;
  return v.status === "unavailable" &&
    (v.reason === "review_data_unavailable" || v.reason === "ai_disabled" || v.reason === "insufficient_reviews");
}
