import { useState } from "react";
import { Link } from "react-router-dom";
import { ButtonPrimary, btnSecondary } from "../components/ui/Button";
import { useFetch } from "../hooks/useFetch";
import { useCourse } from "../lib/course";

type Term = { term: string; definition: string; see: string };
type Acronym = { acronym: string; expansion: string; book: string; printed_page: number };
type Framework = { title: string; body: string };

export function ReferencePrint() {
  const course = useCourse();
  const glossary = useFetch<{ items: Term[] }>("/api/content/glossary");
  const acronyms = useFetch<{ items: Acronym[] }>("/api/content/acronyms");
  const frameworks = useFetch<{ items: Framework[] }>("/api/content/frameworks");
  const [show, setShow] = useState({ glossary: true, acronyms: true, frameworks: true });

  const toggle = (key: keyof typeof show) =>
    setShow((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/glossary" className={btnSecondary}>◂ BACK</Link>
        {(["glossary", "acronyms", "frameworks"] as const).map((key) => (
          <label key={key} className="mono-label flex items-center gap-1 text-[10px]">
            <input type="checkbox" checked={show[key]} aria-label={key.toUpperCase()}
                   onChange={() => toggle(key)} />
            {key.toUpperCase()}
          </label>
        ))}
        <ButtonPrimary onClick={() => window.print()}>PRINT ▸</ButtonPrimary>
      </div>

      <div className="print-sheet bg-white p-8 text-sm text-black">
        <h1 className="mb-4 text-2xl font-bold">{course?.name ?? "Course"} reference pack</h1>
        {show.glossary && (
          <section data-testid="ref-glossary" className="mb-6">
            {glossary.data && (
              <>
                <h2 className="mb-2 border-b border-black text-lg font-bold">Glossary</h2>
                {glossary.data.items.map((t) => (
                  <div key={t.term} className="mb-1.5 break-inside-avoid leading-snug">
                    <span className="font-bold">{t.term}</span>: {t.definition}{" "}
                    <span className="italic">{t.see}</span>
                  </div>
                ))}
              </>
            )}
            {glossary.error && (
              <div className="print:hidden">
                <p className="text-sm text-rd">{glossary.error}</p>
              </div>
            )}
          </section>
        )}
        {show.acronyms && (
          <section data-testid="ref-acronyms" className="mb-6 break-before-page">
            {acronyms.data && (
              <>
                <h2 className="mb-2 border-b border-black text-lg font-bold">Acronyms</h2>
                <div className="columns-2 gap-8">
                  {acronyms.data.items.map((a) => (
                    <div key={a.acronym} className="mb-1 break-inside-avoid leading-snug">
                      <span className="font-bold">{a.acronym}</span> {a.expansion}{" "}
                      <span className="italic">{a.book} p.{a.printed_page}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {acronyms.error && (
              <div className="print:hidden">
                <p className="text-sm text-rd">{acronyms.error}</p>
              </div>
            )}
          </section>
        )}
        {show.frameworks && (
          <section data-testid="ref-frameworks" className="break-before-page">
            {frameworks.data && (
              <>
                <h2 className="mb-2 border-b border-black text-lg font-bold">Frameworks</h2>
                {frameworks.data.items.map((f) => (
                  <div key={f.title} className="mb-3 break-inside-avoid leading-snug">
                    <div className="font-bold">{f.title}</div>
                    <div className="whitespace-pre-wrap">{f.body}</div>
                  </div>
                ))}
              </>
            )}
            {frameworks.error && (
              <div className="print:hidden">
                <p className="text-sm text-rd">{frameworks.error}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
