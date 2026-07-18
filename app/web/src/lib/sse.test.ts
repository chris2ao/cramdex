import { readSse } from "./sse";

function streamOf(text: string): Response {
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
  });
  return new Response(stream);
}

test("parses events split across data lines", async () => {
  const events: Array<[string, string]> = [];
  await readSse(
    streamOf("event: sources\ndata: [1,2]\n\nevent: delta\ndata: hello\ndata: world\n\n"),
    (e, d) => events.push([e, d]),
  );
  expect(events).toEqual([["sources", "[1,2]"], ["delta", "hello\nworld"]]);
});
