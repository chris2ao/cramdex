import "./testLocalStorage";
import { clearLabOverride, labDone, labsStore, setLabDone } from "./labs";

beforeEach(() => {
  window.localStorage.clear();
  labsStore.set(() => ({ overrides: {} }));
});

test("labDone falls back to defaultDone when no override exists", () => {
  expect(labDone(labsStore.get(), "lab-4.4", true)).toBe(true);
  expect(labDone(labsStore.get(), "lab-4.4", false)).toBe(false);
});

test("setLabDone overrides the default", () => {
  setLabDone("lab-4.4", true);
  expect(labDone(labsStore.get(), "lab-4.4", false)).toBe(true);

  setLabDone("lab-4.4", false);
  expect(labDone(labsStore.get(), "lab-4.4", true)).toBe(false);
});

test("clearLabOverride removes the override, reverting to defaultDone", () => {
  setLabDone("lab-4.4", true);
  clearLabOverride("lab-4.4");
  expect(labDone(labsStore.get(), "lab-4.4", false)).toBe(false);
});

test("overrides are independent per lab id", () => {
  setLabDone("lab-4.4", true);
  setLabDone("lab-4.5", false);
  expect(labDone(labsStore.get(), "lab-4.4", false)).toBe(true);
  expect(labDone(labsStore.get(), "lab-4.5", true)).toBe(false);
});
