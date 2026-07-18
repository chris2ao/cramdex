import { useFetch } from "../hooks/useFetch";

const FIXES: Record<string, string> = {
  course_pack: "NO COURSE PACK CONFIGURED: run the setup wizard",
  corpus_db: "CORPUS INDEX MISSING: run scripts/build.sh",
  poppler: "POPPLER MISSING: brew install poppler",
  llm: "NO LLM PROVIDER CONFIGURED: Ask and AI quiz are disabled (see docs)",
  books_dir: "BOOKS FOLDER UNREACHABLE: page images will not render",
  pdf_password:
    "COURSEWARE PASSWORD NOT SET (CRAMDEX_PDF_PASSWORD or the pack's .corpus/.pdf_password)",
};

export function HealthBanner() {
  const { data, error } = useFetch<{ ok: boolean; checks: Record<string, boolean> }>(
    "/api/health");
  if (error) {
    return (
      <div className="mb-6 border border-rd bg-rd-dim p-4 text-sm print:hidden">
        <div className="mono-label mb-1 text-[10px] text-rd">{"// SETUP_REQUIRED"}</div>
        <p className="text-muted">Health check failed: {error}</p>
      </div>
    );
  }
  if (!data || data.ok) return null;
  return (
    <div className="mb-6 border border-rd bg-rd-dim p-4 text-sm print:hidden">
      <div className="mono-label mb-2 text-[10px] text-rd">{"// SETUP_REQUIRED"}</div>
      <ul className="space-y-1">
        {Object.entries(data.checks)
          .filter(([, ok]) => !ok)
          .map(([key]) => (
            <li key={key} className="flex items-baseline gap-2 text-muted">
              <span aria-hidden className="text-rd">▸</span>
              {FIXES[key] ?? key}
            </li>
          ))}
      </ul>
    </div>
  );
}
