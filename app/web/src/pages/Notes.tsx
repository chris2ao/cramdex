import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { MarkdownView } from "../components/MarkdownView";
import { Loading } from "../components/Loading";
import { Panel } from "../components/ui/Panel";
import { Pill } from "../components/ui/Pill";
import { Eyebrow } from "../components/ui/Text";

type NoteItem = { title: string; path: string };

// Article styling: 16px/500 body, yellow bold key items, uppercase doc title (its h1).
const ARTICLE =
  "p-[26px] md:px-[30px] text-[16px] font-medium leading-[1.65] " +
  "[&_strong]:text-yl [&_strong]:font-bold " +
  "[&_h1]:!text-[22px] [&_h1]:!font-bold [&_h1]:!uppercase [&_h1]:!tracking-[0.03em] [&_h1]:!mt-0";

function pillLabel(title: string): string {
  return title.replace(/\s+/g, "_");
}

function NoteDoc({ path }: { path: string }) {
  const { data, error } = useFetch<{ markdown: string }>(
    `/api/content/doc?path=${encodeURIComponent(path)}`);
  if (error) return <p className="text-rd">{error}</p>;
  if (!data) return <Loading />;
  return (
    <Panel bracket="cy-tl" className={ARTICLE}>
      <MarkdownView markdown={data.markdown} />
    </Panel>
  );
}

export function Notes() {
  const { data, error } = useFetch<{ items: NoteItem[] }>("/api/content/notes");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const items = data?.items ?? [];
  const path = selectedPath ?? items[0]?.path ?? null;

  return (
    <div className="max-w-[820px]">
      <Eyebrow color="rd">PERSONAL_LOGS</Eyebrow>
      <h1 className="text-[30px] font-bold uppercase tracking-[0.02em] mt-2 mb-[18px]">Cheatsheets & notes</h1>
      {error && <p className="text-rd">{error}</p>}
      {!data && !error && <Loading />}
      {data && items.length === 0 && (
        <Panel className="p-6 text-muted">
          No notes in this course pack yet. Add markdown files to the pack's notes/ folder.
        </Panel>
      )}
      {items.length > 0 && (
        <>
          <div className="flex gap-2 mb-5 flex-wrap">
            {items.map((item) => (
              <Pill key={item.path} active={path === item.path} color="yl"
                    onClick={() => setSelectedPath(item.path)}>
                {pillLabel(item.title)}
              </Pill>
            ))}
          </div>
          {path && <NoteDoc path={path} />}
        </>
      )}
    </div>
  );
}
