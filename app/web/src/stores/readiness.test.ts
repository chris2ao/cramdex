import { computeReadiness } from "./readiness";

test("blends books, mastery, and labs at 0.4 / 0.4 / 0.2 weights", () => {
  const result = computeReadiness({
    bookPcts: [80, 60],
    topicMasteries: [100, 0, 50],
    labsDone: 3,
    labsTotal: 4,
  });
  // books = mean([80,60]) = 70; mastery = mean([100,0,50]) = 50; labs = 3/4*100 = 75
  // overall = 0.4*70 + 0.4*50 + 0.2*75 = 28 + 20 + 15 = 63
  expect(result).toEqual({ books: 70, mastery: 50, labs: 75, overall: 63 });
});

test("treats null topic masteries as 0", () => {
  const result = computeReadiness({
    bookPcts: [100],
    topicMasteries: [null, null],
    labsDone: 0,
    labsTotal: 0,
  });
  expect(result.mastery).toBe(0);
});

test("labsTotal of 0 yields 0 labs percentage instead of dividing by zero", () => {
  const result = computeReadiness({ bookPcts: [], topicMasteries: [], labsDone: 0, labsTotal: 0 });
  expect(result).toEqual({ books: 0, mastery: 0, labs: 0, overall: 0 });
});

test("rounds all values to the nearest integer", () => {
  const result = computeReadiness({
    bookPcts: [33, 34, 34],
    topicMasteries: [100],
    labsDone: 1,
    labsTotal: 3,
  });
  expect(Number.isInteger(result.books)).toBe(true);
  expect(Number.isInteger(result.mastery)).toBe(true);
  expect(Number.isInteger(result.labs)).toBe(true);
  expect(Number.isInteger(result.overall)).toBe(true);
});
