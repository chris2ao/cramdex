import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { CitationText } from "../components/CitationText";
import { Panel } from "../components/ui/Panel";
import { Eyebrow } from "../components/ui/Text";

type Term = { term: string; definition: string; see: string };
type Acronym = { acronym: string; expansion: string; book: string; printed_page: number };

export function Glossary() {
  const glossary = useFetch<{ items: Term[] }>("/api/content/glossary");
  const acronyms = useFetch<{ items: Acronym[] }>("/api/content/acronyms");
  const [filter, setFilter] = useState("");
  const f = filter.toLowerCase();

  const terms = glossary.data?.items.filter(
    (t) => t.term.toLowerCase().includes(f) || t.definition.toLowerCase().includes(f)) ?? [];
  const acros = acronyms.data?.items.filter(
    (a) => a.acronym.toLowerCase().includes(f) || a.expansion.toLowerCase().includes(f)) ?? [];

  return (
    <div>
      <Eyebrow className="mb-2">DATA_BANK</Eyebrow>
      <h1 className="mb-4 text-[30px] font-bold uppercase tracking-wide text-fg">Glossary</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter terms and acronyms //"
        aria-label="Filter terms and acronyms"
        className="input-hud mb-5 block w-full max-w-[480px] px-4 py-2.5 text-base font-medium"
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.4fr_1fr] md:items-start">
        <section>
          <div className="mono-label mb-2.5 text-[10px] tracking-[0.18em] text-faint">
            // CURATED_TERMS
          </div>
          <div className="flex flex-col gap-2.5">
            {terms.map((t) => (
              <Panel key={t.term} className="border-l-2 border-l-cy px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-2.5">
                  <h3 className="text-[17px] font-bold uppercase tracking-[0.04em] text-fg">
                    <CitationText text={t.term} />
                  </h3>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-faint">
                    <CitationText text={t.see} />
                  </span>
                </div>
                <p className="mt-1.5 text-[14.5px] font-medium leading-relaxed text-muted">
                  <CitationText text={t.definition} />
                </p>
              </Panel>
            ))}
          </div>
        </section>

        <section>
          <div className="mono-label mb-2.5 text-[10px] tracking-[0.18em] text-faint">
            // ACRONYMS [{acros.length}]
          </div>
          <Panel>
            {acros.map((a) => (
              <div
                key={`${a.acronym}-${a.printed_page}`}
                className="flex items-baseline gap-3 border-b border-edge px-3.5 py-2
                           transition-colors duration-120 last:border-b-0 hover:bg-panel-2"
              >
                <span className="w-[72px] shrink-0 font-mono text-xs text-yl">{a.acronym}</span>
                <span className="flex-1 text-[13.5px] font-medium text-muted">{a.expansion}</span>
                <span className="whitespace-nowrap font-mono text-[10px] text-faint">
                  <CitationText text={`${a.book} p.${a.printed_page}`} />
                </span>
              </div>
            ))}
          </Panel>
        </section>
      </div>

      {(glossary.error || acronyms.error) && (
        <p className="mt-4 text-sm text-rd">{glossary.error || acronyms.error}</p>
      )}
    </div>
  );
}
