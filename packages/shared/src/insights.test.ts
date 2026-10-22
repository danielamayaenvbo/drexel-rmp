import { describe, expect, it } from "vitest";
import { isProfessorInsights } from "./insights";

const valid = {
  professorId: "123",
  professorName: "Test Professor",
  rating: 4.2,
  reviewsAnalyzed: 3,
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: "Students commonly describe clear explanations and demanding exams.",
  positives: [{ theme: "Clear explanations", explanation: "Mentioned repeatedly.", supportingReviewIds: ["a", "b"] }],
  negatives: [],
  categories: {
    clarity: "positive",
    workload: "mixed",
    exams: "negative",
    grading: "insufficient_evidence",
    accessibility: "positive",
  },
  evidence: {},
};

describe("isProfessorInsights", () => {
  it("accepts a complete structured response", () => {
    expect(isProfessorInsights(valid)).toBe(true);
  });

  it("rejects malformed model output and unknown labels", () => {
    expect(isProfessorInsights({ ...valid, summary: "" })).toBe(false);
    expect(isProfessorInsights({ ...valid, categories: { ...valid.categories, exams: "certain" } })).toBe(false);
    expect(isProfessorInsights({ ...valid, positives: [{ theme: "x" }] })).toBe(false);
  });
});
