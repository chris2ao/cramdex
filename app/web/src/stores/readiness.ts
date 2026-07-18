export type ReadinessInput = {
  bookPcts: number[];
  topicMasteries: Array<number | null>;
  labsDone: number;
  labsTotal: number;
};

export type Readiness = { books: number; mastery: number; labs: number; overall: number };

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

/**
 * Blends book progress, quiz mastery, and lab completion into a single readiness
 * score: books and mastery each weigh 0.4, labs weighs 0.2. All outputs 0-100, rounded.
 */
export function computeReadiness(input: ReadinessInput): Readiness {
  const books = mean(input.bookPcts);
  const mastery = mean(input.topicMasteries.map((m) => m ?? 0));
  const labs = input.labsTotal <= 0 ? 0 : (input.labsDone / input.labsTotal) * 100;
  const overall = 0.4 * books + 0.4 * mastery + 0.2 * labs;
  return {
    books: Math.round(books),
    mastery: Math.round(mastery),
    labs: Math.round(labs),
    overall: Math.round(overall),
  };
}
