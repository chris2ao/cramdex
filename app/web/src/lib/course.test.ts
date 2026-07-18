import { expect, test, vi, beforeEach } from "vitest";
import { fetchCourse, fetchTopics, resetCourseCache, fetchCourses, activateCourse } from "./course";

const COURSE = { name: "Demo Course", exam_date: null, books: [{ slug: "book1", label: "Book 1" }] };
const TOPICS = { promoted: [], themes: { "Book 1": "Book 1" }, fallback: "General", order: ["Book 1", "General"] };

beforeEach(() => {
  resetCourseCache();
  vi.restoreAllMocks();
});

test("fetchCourse caches a single request", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(COURSE)) as Response);
  expect(await fetchCourse()).toEqual(COURSE);
  await fetchCourse();
  expect(mock).toHaveBeenCalledTimes(1);
});

test("fetchTopics rejects on HTTP error and clears the cache", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("nope", { status: 503 }) as Response);
  await expect(fetchTopics()).rejects.toThrow("503");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(TOPICS)) as Response);
  expect(await fetchTopics()).toEqual(TOPICS);
});

const COURSE_LIST = [
  { slug: "alpha", name: "Alpha Course", active: true, valid: true },
  { slug: "beta", name: null, active: false, valid: false },
];

test("fetchCourses fetches /api/courses and unwraps items", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items: COURSE_LIST })) as Response);
  expect(await fetchCourses()).toEqual(COURSE_LIST);
  expect(mock).toHaveBeenCalledWith("/api/courses");
});

test("fetchCourses is not cached: every call re-fetches", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ items: COURSE_LIST })) as Response);
  await fetchCourses();
  await fetchCourses();
  expect(mock).toHaveBeenCalledTimes(2);
});

test("fetchCourses rejects on HTTP error", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("nope", { status: 503 }) as Response);
  await expect(fetchCourses()).rejects.toThrow("503");
});

test("activateCourse posts the slug and resolves on ok", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items: COURSE_LIST }), { status: 200 }) as Response);
  await expect(activateCourse("beta")).resolves.toBeUndefined();
  expect(mock).toHaveBeenCalledWith("/api/course/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "beta" }),
  });
});

test("activateCourse throws with the response detail on failure", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: 'Course "ghost" not found.' }), { status: 404 }) as Response);
  await expect(activateCourse("ghost")).rejects.toThrow('Course "ghost" not found.');
});

test("activateCourse falls back to a status message when the body has no detail", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", { status: 503 }) as Response);
  await expect(activateCourse("alpha")).rejects.toThrow("503");
});
