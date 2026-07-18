import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationText } from "./CitationText";

// Wraps every string child so citations become chips wherever they appear.
function chipify(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return <CitationText text={children} />;
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <CitationText key={i} text={c} /> : c);
  }
  return children;
}

const components = Object.fromEntries(
  ["p", "li", "td", "th", "em", "strong", "blockquote", "h1", "h2", "h3", "h4"].map(
    (tag) => [tag, ({ node: _node, children, ...props }: any) => {
      const Tag = tag as any;
      return <Tag {...props}>{chipify(children)}</Tag>;
    }]
  )
);

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="prose-study space-y-3 [&_h1]:text-2xl [&_h1]:font-semibold
                    [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6
                    [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4
                    [&_a]:text-cy [&_code]:font-mono [&_code]:text-cy/90
                    [&_table]:text-sm [&_td]:border [&_td]:border-edge [&_td]:px-2 [&_td]:py-1
                    [&_th]:border [&_th]:border-edge [&_th]:px-2 [&_th]:py-1
                    [&_th]:bg-panel-2
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                    [&_blockquote]:border-l-2 [&_blockquote]:border-cy/40
                    [&_blockquote]:pl-3 [&_blockquote]:text-muted">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
