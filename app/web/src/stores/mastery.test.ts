import "./testLocalStorage";
import { isWeak, masteryStore, recordGrade, topicMastery } from "./mastery";

beforeEach(() => {
  window.localStorage.clear();
  masteryStore.set(() => ({ topics: {} }));
});

test("topicMastery is null when there are no attempts", () => {
  expect(topicMastery(masteryStore.get(), "containment")).toBeNull();
});

test("recordGrade accumulates got and missed counts", () => {
  recordGrade("containment", true);
  recordGrade("containment", true);
  recordGrade("containment", false);
  const state = masteryStore.get();
  expect(state.topics.containment.got).toBe(2);
  expect(state.topics.containment.missed).toBe(1);
});

test("topicMastery computes got / (got + missed) as a percentage", () => {
  recordGrade("containment", true);
  recordGrade("containment", true);
  recordGrade("containment", false);
  expect(topicMastery(masteryStore.get(), "containment")).toBeCloseTo((2 / 3) * 100);
});

test("isWeak is false with no attempts, true below 50 percent, false at or above 50 percent", () => {
  expect(isWeak(masteryStore.get(), "eradication")).toBe(false);

  recordGrade("eradication", false);
  recordGrade("eradication", false);
  recordGrade("eradication", true);
  expect(topicMastery(masteryStore.get(), "eradication")).toBeCloseTo((1 / 3) * 100);
  expect(isWeak(masteryStore.get(), "eradication")).toBe(true);

  recordGrade("eradication", true);
  recordGrade("eradication", true);
  expect(topicMastery(masteryStore.get(), "eradication")).toBeCloseTo(60);
  expect(isWeak(masteryStore.get(), "eradication")).toBe(false);
});
