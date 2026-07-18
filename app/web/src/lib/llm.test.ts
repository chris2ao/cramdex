import { expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchLlm, resetLlmCache, useLlmGuard } from "./llm";

const LLM = { name: "anthropic_api", display_name: "Anthropic API", configured: true, detail: "key present" };

beforeEach(() => {
  resetLlmCache();
  vi.restoreAllMocks();
});

test("fetchLlm caches a single request", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(LLM)) as Response);
  expect(await fetchLlm()).toEqual(LLM);
  await fetchLlm();
  expect(mock).toHaveBeenCalledTimes(1);
});

test("fetchLlm rejects on HTTP error and clears the cache", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("nope", { status: 503 }) as Response);
  await expect(fetchLlm()).rejects.toThrow("503");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(LLM)) as Response);
  expect(await fetchLlm()).toEqual(LLM);
});

test("useLlmGuard reports llmUnconfigured false while still loading", () => {
  vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {})); // never resolves
  const { result } = renderHook(() => useLlmGuard());
  expect(result.current.llm).toBeNull();
  expect(result.current.llmUnconfigured).toBe(false);
});

test("useLlmGuard reports llmUnconfigured false once a configured provider loads", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(LLM)) as Response);
  const { result } = renderHook(() => useLlmGuard());
  await waitFor(() => expect(result.current.llm).toEqual(LLM));
  expect(result.current.llmUnconfigured).toBe(false);
});

test("useLlmGuard reports llmUnconfigured true once an unconfigured provider loads", async () => {
  const unconfigured = { ...LLM, configured: false, detail: "no key" };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(unconfigured)) as Response);
  const { result } = renderHook(() => useLlmGuard());
  await waitFor(() => expect(result.current.llm).toEqual(unconfigured));
  expect(result.current.llmUnconfigured).toBe(true);
});
