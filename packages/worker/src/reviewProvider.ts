import type { Review, ReviewProvider } from "./insights";

/** RMP's public teacher search returns aggregates only; no authorized review-text source is configured. */
export class UnavailableReviewProvider implements ReviewProvider {
  async getReviews(_professorId: string): Promise<Review[]> {
    return [];
  }
}
