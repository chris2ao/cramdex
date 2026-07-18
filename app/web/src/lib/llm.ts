// Active LLM provider status, fetched once per app load from the server
// (which resolves the provider from config/environment; see /api/llm).
import { useEffect, useState } from "react";

export type LlmStatus = {
  name: string;
  display_name: string;
  configured: boolean;
  detail: string;
};

let llmPromise: Promise<LlmStatus> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export function fetchLlm(): Promise<LlmStatus> {
  llmPromise ??= getJson<LlmStatus>("/api/llm").catch((err) => {
    llmPromise = null;
    throw err;
  });
  return llmPromise;
}

export function resetLlmCache(): void {
  llmPromise = null;
}

// Provider misconfiguration (configured: false) is a normal, expected state
// surfaced by Ask/Quiz's own notices, not an error. This hook only logs
// actual load failures (network/HTTP errors) and leaves the cached value at
// null, so consumers should treat null as "still loading" rather than
// expecting an error UI here.
function usePromise<T>(start: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    start().then((v) => {
      if (alive) setValue(v);
    }).catch((err) => {
      console.error("cramdex: failed to load LLM provider status", err);
    });
    return () => {
      alive = false;
    };
  }, [start]);
  return value;
}

export function useLlm(): LlmStatus | null {
  return usePromise(fetchLlm);
}

// Shared guard predicate for Ask/Quiz: null means "still loading" and must
// not disable the control (the health banner is the surface for setup
// problems, not a flash of this notice).
export function useLlmGuard(): { llm: LlmStatus | null; llmUnconfigured: boolean } {
  const llm = useLlm();
  const llmUnconfigured = llm !== null && !llm.configured;
  return { llm, llmUnconfigured };
}
