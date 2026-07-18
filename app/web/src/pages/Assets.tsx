import { useFetch } from "../hooks/useFetch";
import { Loading } from "../components/Loading";
import { Panel } from "../components/ui/Panel";
import { Eyebrow } from "../components/ui/Text";

type Asset = { name: string; kind: "image" | "pdf" | "html"; path: string };

export function Assets() {
  const { data, error } = useFetch<{ items: Asset[] }>("/api/content/assets");
  if (error) return <p className="text-rd">{error}</p>;
  if (!data) return <Loading />;
  return (
    <div>
      <Eyebrow color="rd">MEDIA_VAULT</Eyebrow>
      <h1 className="text-[30px] font-bold uppercase tracking-[0.02em] mt-2 mb-5">Assets</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px] max-w-[900px]">
        {data.items.filter((a) => a.name !== "README.md").map((a) => {
          const src = `/api/content/file?path=${encodeURIComponent(a.path)}`;
          return (
            <Panel key={a.path} className="p-[14px]">
              <div className="flex justify-between items-center mb-[10px]">
                <span className="font-mono text-xs text-fg">{a.name}</span>
                <a href={src} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] tracking-[0.08em] text-cy hover:text-fg">
                  OPEN ↗
                </a>
              </div>
              <div className="border border-edge-2">
                {a.kind === "image" && (
                  <img src={src} alt={a.name} className="block max-w-full" />)}
                {a.kind === "pdf" && (
                  <iframe src={src} title={a.name} className="block w-full h-[70vh]" />)}
                {a.kind === "html" && (
                  <iframe src={src} title={a.name} sandbox=""
                          className="block w-full h-[70vh] bg-white" />)}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
