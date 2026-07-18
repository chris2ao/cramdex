import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { MarkdownView } from "../components/MarkdownView";
import { Panel } from "../components/ui/Panel";
import { Eyebrow } from "../components/ui/Text";

type Framework = { title: string; body: string };

/**
 * Splits a titled framework into its short name and a mono system-id derived
 * from the descriptive tail after a dash separator. A title like "Demo Cycle,
 * the incident-handling lifecycle" (dash-separated in the source) becomes
 * name "Demo Cycle" plus sub "INCIDENT_HANDLING_LIFECYCLE"; a bare
 * "Demo Cycle" yields an empty sub. The character class matches em dash, en
 * dash, or hyphen.
 */
function splitTitle(title: string): { name: string; sub: string } {
  const [name, ...rest] = title.split(/\s+[\u2014\u2013-]\s+/);
  const sub = rest
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return { name: name.trim(), sub };
}

export function Frameworks() {
  const { data, error } = useFetch<{ items: Framework[] }>("/api/content/frameworks");
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  if (error) return <p className="text-rd">{error}</p>;
  return (
    <div>
      <Eyebrow className="mb-2">PROTOCOL_LIBRARY</Eyebrow>
      <h1 className="text-[30px] font-bold uppercase tracking-wide text-fg">Key frameworks</h1>
      <p className="mb-5 mt-1.5 font-mono text-[11px] tracking-[0.05em] text-faint">
        THE MNEMONICS THAT STRUCTURE THE COURSE · SELECT TO EXPAND
      </p>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {data?.items.map((f, i) => {
          const open = openIdx === i;
          const { name, sub } = splitTitle(f.title);
          return (
            <Panel
              key={f.title}
              className={`p-5 transition-colors duration-120 ${
                open ? "border-cy! md:col-span-2" : "hover:border-cy"
              }`}
            >
              <button
                onClick={() => setOpenIdx(open ? null : i)}
                aria-expanded={open}
                aria-label={name}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <span>
                  <span className="block text-[21px] font-bold uppercase tracking-[0.05em] text-fg">
                    {name}
                  </span>
                  {sub && (
                    <span className="mt-1 block font-mono text-[11px] tracking-[0.05em] text-faint">
                      {sub}
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm text-yl">{open ? "[-]" : "[+]"}</span>
              </button>

              {open && (
                <div
                  className="mt-3.5 border-t border-edge-2 pt-3.5 text-[15px] font-medium
                             leading-relaxed text-fg [&_p]:text-muted [&_strong]:font-bold
                             [&_strong]:text-fg"
                >
                  <MarkdownView markdown={f.body} />
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
