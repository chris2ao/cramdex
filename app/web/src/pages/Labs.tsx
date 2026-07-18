import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useFetch } from "../hooks/useFetch";
import { MarkdownView } from "../components/MarkdownView";
import { DataTable } from "../components/DataTable";
import { Loading } from "../components/Loading";
import { Panel } from "../components/ui/Panel";
import { Pill } from "../components/ui/Pill";
import { Eyebrow } from "../components/ui/Text";
import { useStore } from "../stores/useStore";
import { labDone, labsStore, setLabDone } from "../stores/labs";

type Lab = { id: string; title: string; writeup: string;
             comparison: string | null; csvs: string[]; desc?: string };
type Group = { book: string; labs: Lab[] };

// "book3" -> "BOOK_3": uppercase, split letter/number runs, spaces to underscores.
function bookLabel(book: string): string {
  return book.toUpperCase().replace(/([A-Za-z])(\d)/g, "$1_$2").replace(/[\s-]+/g, "_");
}

function LabDoc({ path }: { path: string }) {
  const { data, error } = useFetch<{ markdown: string }>(
    `/api/content/doc?path=${encodeURIComponent(path)}`);
  if (error) return <p className="text-rd text-sm">{error}</p>;
  if (!data) return <Loading />;
  return <MarkdownView markdown={data.markdown} />;
}

function LabCsv({ path }: { path: string }) {
  const { data, error } = useFetch<{ headers: string[]; rows: string[][] }>(
    `/api/content/csv?path=${encodeURIComponent(path)}`);
  if (error) return <p className="text-rd text-sm">{error}</p>;
  if (!data) return <Loading />;
  return <DataTable headers={data.headers} rows={data.rows} />;
}

function LabRow({ lab, done, onOpen }: {
  lab: Lab; done: boolean; onOpen: () => void;
}) {
  const openOnKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
  };
  const toggle = (e: MouseEvent) => { e.stopPropagation(); setLabDone(lab.id, !done); };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={openOnKey}
         className="text-left cursor-pointer">
      <Panel className="flex items-center gap-4 px-[18px] py-[14px]
                        transition-colors duration-120 hover:border-cy">
        <button onClick={toggle}
          className={`font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5
                      text-black ${done ? "bg-gn" : "bg-yl"}`}>
          {done ? "DONE" : "OPEN"}
        </button>
        <div className="flex-1">
          <div className="text-[17px] font-bold uppercase tracking-[0.04em]">{lab.title}</div>
          {lab.desc && (
            <div className="text-[14px] font-medium text-muted mt-0.5">{lab.desc}</div>)}
        </div>
        {lab.csvs.length > 0 && (
          <span className="font-mono text-[10px] text-faint border border-edge-2 px-1.5 py-px">
            {lab.csvs.length}_CSV</span>)}
      </Panel>
    </div>
  );
}

export function Labs() {
  const { data, error } = useFetch<{ items: Group[] }>("/api/content/labs");
  const labsState = useStore(labsStore);
  const [selected, setSelected] = useState<Lab | null>(null);
  const [tab, setTab] = useState<"writeup" | "comparison">("writeup");

  if (error) return <p className="text-rd">{error}</p>;
  if (!data && !selected) return <Loading />;
  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)}
                className="mono-label text-[10px] text-muted hover:text-cy mb-4">
          {"← ALL_LABS"}
        </button>
        <h1 className="text-[24px] font-bold uppercase tracking-[0.02em] mb-4">{selected.title}</h1>
        {selected.comparison && (
          <div className="flex gap-2 mb-4">
            {(["writeup", "comparison"] as const).map((t) => (
              <Pill key={t} active={tab === t} color="yl" onClick={() => setTab(t)}>
                {t === "writeup" ? "My write-up" : "Comparison"}
              </Pill>
            ))}
          </div>
        )}
        <Panel bracket="cy-tl" className="p-6 md:p-[26px] text-[16px] font-medium">
          <LabDoc path={tab === "comparison" && selected.comparison
                        ? selected.comparison : selected.writeup} />
        </Panel>
        {selected.csvs.map((c) => (
          <div key={c} className="mt-6">
            <div className="mono-label text-[10px] text-faint mb-2">{c.split("/").pop()}</div>
            <LabCsv path={c} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <Eyebrow color="rd">FIELD_OPS</Eyebrow>
      <h1 className="text-[30px] font-bold uppercase tracking-[0.02em] mt-2 mb-5">Labs</h1>
      {data?.items.map((g) => (
        <div key={g.book} className="mb-6">
          <Eyebrow color="faint" className="tracking-[0.18em] mb-[10px]">{bookLabel(g.book)}</Eyebrow>
          <div className="flex flex-col gap-[10px] max-w-[840px]">
            {g.labs.map((lab) => (
              <LabRow key={lab.id} lab={lab}
                done={labDone(labsState, lab.id, lab.comparison != null)}
                onOpen={() => { setSelected(lab); setTab("writeup"); }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
