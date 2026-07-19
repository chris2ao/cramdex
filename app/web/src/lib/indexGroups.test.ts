import type { IndexEntry } from "../stores/examIndex";
import { groupByLetter } from "./indexGroups";

const E = (term: string): IndexEntry => ({
  id: `id-${term}`, term, definition: "", topic: "", at: 1,
  citations: [{ slug: "book1", label: "Book 1", page: 3 }],
});

test("groups alphabetically with the # bucket first", () => {
  const groups = groupByLetter([E("regolith sweep"), E("3 Dust Lock drills"), E("Crater Watch"), E("Demo Cycle"), E("dust lock")]);
  expect(groups.map((g) => g.letter)).toEqual(["#", "C", "D", "R"]);
  expect(groups[2].entries.map((e) => e.term)).toEqual(["Demo Cycle", "dust lock"]);
});

test("empty input produces no groups", () => {
  expect(groupByLetter([])).toEqual([]);
});
