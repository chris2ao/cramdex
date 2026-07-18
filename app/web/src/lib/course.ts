// Course metadata and quiz topic taxonomy, fetched once per app load from
// the server (which reads them from the active course pack).
import { useEffect, useState } from "react";

export type CourseBook = { slug: string; label: string };
export type CourseInfo = {
  name: string;
  exam_date: string | null;
  books: CourseBook[];
};
export type TopicsConfig = {
  promoted: { key: string; label: string }[];
  themes: Record<string, string>;
  fallback: string;
  order: string[];
};

let coursePromise: Promise<CourseInfo> | null = null;
let topicsPromise: Promise<TopicsConfig> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export function fetchCourse(): Promise<CourseInfo> {
  coursePromise ??= getJson<CourseInfo>("/api/course").catch((err) => {
    coursePromise = null;
    throw err;
  });
  return coursePromise;
}

export function fetchTopics(): Promise<TopicsConfig> {
  topicsPromise ??= getJson<TopicsConfig>("/api/content/topics").catch((err) => {
    topicsPromise = null;
    throw err;
  });
  return topicsPromise;
}

export function resetCourseCache(): void {
  coursePromise = null;
  topicsPromise = null;
}

export type CourseListItem = {
  slug: string;
  name: string | null;
  active: boolean;
  valid: boolean;
};

// Unlike fetchCourse/fetchTopics above, this is intentionally NOT
// promise-cached: the course switcher wants a fresh list every time it
// opens (another tab or process may have activated a different pack since
// the app loaded), so this stays a plain fetch helper.
export async function fetchCourses(): Promise<CourseListItem[]> {
  const resp = await fetch("/api/courses");
  if (!resp.ok) throw new Error(`/api/courses: HTTP ${resp.status}`);
  const body = (await resp.json()) as { items: CourseListItem[] };
  return body.items;
}

// Resolves on a 200 response; otherwise throws an Error using the server's
// {"detail": "..."} body when present (falls back to the HTTP status).
export async function activateCourse(slug: string): Promise<void> {
  const resp = await fetch("/api/course/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `/api/course/activate: HTTP ${resp.status}`);
  }
}

// Pack and server problems (missing pack, HTTP errors, ...) surface to the
// user through the health banner's /api/health checks, not through this
// hook. This hook only logs the failure and leaves the cached value at
// null, so hook consumers should render their own loading/empty states
// rather than expecting an error UI here.
function usePromise<T>(start: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    start().then((v) => {
      if (alive) setValue(v);
    }).catch((err) => {
      console.error("cramdex: failed to load course data", err);
    });
    return () => {
      alive = false;
    };
  }, [start]);
  return value;
}

export function useCourse(): CourseInfo | null {
  return usePromise(fetchCourse);
}

export function useTopics(): TopicsConfig | null {
  return usePromise(fetchTopics);
}
