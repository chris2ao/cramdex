import { renderHook, waitFor } from "@testing-library/react";
import { useFetch } from "./useFetch";

test("data populates on success", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ value: "hello" }),
  })) as any);

  const { result } = renderHook(() => useFetch<{ value: string }>("/api/thing"));
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.data).toEqual({ value: "hello" }));
  expect(result.current.error).toBe("");
});

test("changing path resets data to null then loads the new value", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => ({
    ok: true, json: async () => ({ value: path }),
  })) as any);

  const { result, rerender } = renderHook(
    ({ path }: { path: string }) => useFetch<{ value: string }>(path),
    { initialProps: { path: "/api/one" } });
  await waitFor(() => expect(result.current.data).toEqual({ value: "/api/one" }));

  rerender({ path: "/api/two" });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.data).toEqual({ value: "/api/two" }));
});

test("error populates on failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false, statusText: "Bad Request", json: async () => ({ detail: "nope" }),
  })) as any);

  const { result } = renderHook(() => useFetch<{ value: string }>("/api/thing"));
  await waitFor(() => expect(result.current.error).toBe("nope"));
  expect(result.current.data).toBeNull();
});
