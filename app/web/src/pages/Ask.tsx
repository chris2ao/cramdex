import { useRef, useState, type ReactNode } from "react";
import { readSse } from "../lib/sse";
import { useLlmGuard } from "../lib/llm";
import { CitationChip } from "../components/CitationChip";
import { MarkdownView } from "../components/MarkdownView";
import { Panel } from "../components/ui/Panel";
import { ButtonPrimary, ButtonSecondary } from "../components/ui/Button";
import { Eyebrow, MonoLabel } from "../components/ui/Text";

type Source = { slug: string; label: string; printed_page: number; snippet: string };
type Status = "idle" | "running" | "done" | "error";

// Corpus snippets mark matched terms with [[...]]; render those as cyan highlights.
function highlightSnippet(text: string): ReactNode {
  return text.split(/\[\[(.+?)\]\]/g).map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-cy-dim px-0.5 text-fg">{part}</mark>
      : <span key={i}>{part}</span>,
  );
}

function ResponsePanel({ answer, count, streaming }:
  { answer: string; count: number; streaming: boolean }) {
  return (
    <Panel bracket="cy-tl" className="mb-5 p-6">
      <MonoLabel className="mb-3.5 block">
        {`// RESPONSE${count > 0 ? ` · ${count} PASSAGES_READ` : ""}`}
      </MonoLabel>
      <div className="text-[17px] font-medium leading-[1.7]">
        <MarkdownView markdown={answer} />
        {streaming && <span className="pulse-hud text-cy">▊</span>}
      </div>
    </Panel>
  );
}

function PassagesList({ sources }: { sources: Source[] }) {
  return (
    <div>
      <MonoLabel className="mb-2.5 block">// PASSAGES_READ</MonoLabel>
      <div className="flex flex-col gap-2">
        {sources.map((s, i) => (
          <div key={i} className="flex items-baseline gap-3 border border-edge bg-panel
                                  px-3.5 py-2.5 transition-colors duration-120 hover:border-cy">
            <CitationChip label={s.label} slug={s.slug} page={s.printed_page}
                          text={`${s.label} p.${s.printed_page}`} />
            <span className="text-[14.5px] font-medium leading-relaxed text-muted">
              {highlightSnippet(s.snippet)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Ask() {
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const running = status === "running";
  const { llm, llmUnconfigured } = useLlmGuard();

  async function run() {
    if (!question.trim() || status === "running" || llmUnconfigured) return;
    setSources([]); setAnswer(""); setError(""); setStatus("running");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      let sawTerminal = false;
      await readSse(res, (event, data) => {
        if (event === "sources") setSources(JSON.parse(data));
        else if (event === "delta") setAnswer((a) => a + data);
        else if (event === "error") { setError(data); setStatus("error"); sawTerminal = true; }
        else if (event === "done") { setStatus("done"); sawTerminal = true; }
      });
      if (!sawTerminal) {
        setError("Answer stream ended unexpectedly. The answer above may be incomplete.");
        setStatus("error");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setStatus("error");
      } else setStatus("idle");
    }
  }

  return (
    <div className="max-w-[780px]">
      <Eyebrow color="rd">NEURAL_QUERY</Eyebrow>
      <h1 className="mt-2 mb-1.5 text-[30px] font-bold uppercase tracking-[0.02em]">
        Ask the course
      </h1>
      <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.05em] text-faint">
        Grounded in corpus · Cited to printed page · Verify before trusting
        {llm && llm.configured && ` · ${llm.display_name}`}
      </p>

      <div className="relative mb-6">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), run())}
          rows={3}
          placeholder="e.g. What should happen in the first hour of an incident?"
          aria-label="Question"
          className="input-hud w-full resize-none px-3.5 py-3.5 pr-[120px]
                     text-[17px] font-medium leading-[1.5] outline-none"
        />
        {running ? (
          <ButtonSecondary onClick={() => abortRef.current?.abort()}
                           className="absolute right-3 bottom-3.5">Cancel</ButtonSecondary>
        ) : (
          <ButtonPrimary onClick={run} disabled={llmUnconfigured}
                         className="absolute right-3 bottom-3.5">Ask ▸</ButtonPrimary>
        )}
      </div>

      {llm && !llm.configured && (
        <div className="mb-4 border border-rd bg-rd-dim p-4 text-sm">
          <p className="text-muted">
            AI answers need an LLM provider. Active: {llm.display_name}. {llm.detail}
          </p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-rd">{error}</p>}
      {(answer || running) && (
        <ResponsePanel answer={answer} count={sources.length} streaming={running} />
      )}
      {sources.length > 0 && <PassagesList sources={sources} />}
    </div>
  );
}
