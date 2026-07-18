import { useCourse } from "../lib/course";
import { parseCitations } from "../lib/cite";
import { CitationChip } from "./CitationChip";

// Falls back to an unparsed passthrough (via parseCitations' empty-books
// path) until the course loads, rather than blanking the surrounding text.
export function CitationText({ text }: { text: string }) {
  const course = useCourse();
  const books = course?.books ?? [];
  return (
    <>
      {parseCitations(text, books).map((seg, i) =>
        seg.kind === "cite" ? <CitationChip key={i} {...seg} /> : <span key={i}>{seg.text}</span>
      )}
    </>
  );
}
