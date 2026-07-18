import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Resolves the active pack's corpus DB: $CRAMDEX_HOME/courses/<slug>/.corpus/corpus.db,
 * where <slug> is read from $CRAMDEX_HOME/config.yaml's `active_course` key.
 * config.yaml is a one-key file, so a regex line match is enough and keeps
 * this script dependency-light (no YAML parser needed just for this check).
 * The slug may be single-quoted, double-quoted, or bare, since PyYAML's
 * safe_dump quotes scalars only when it decides they need it, so the value
 * alternatives tolerate all three forms.
 * Returns null when config.yaml is missing or does not parse, which the
 * caller treats as "skip this suite".
 */
function resolveCorpusDb(): string | null {
  const cramdexHome = process.env.CRAMDEX_HOME ?? resolve(homedir(), ".cramdex");
  const configPath = resolve(cramdexHome, "config.yaml");
  if (!existsSync(configPath)) return null;
  let configText: string;
  try {
    configText = readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }
  const match = configText.match(
    /^\s*active_course:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m);
  if (!match) return null;
  const slug = match[1] ?? match[2] ?? match[3];
  return resolve(cramdexHome, "courses", slug, ".corpus", "corpus.db");
}

const CORPUS = resolveCorpusDb();
test.skip(!CORPUS || !existsSync(CORPUS), "corpus not built on this machine");

// Override with a term guaranteed to hit in whatever corpus is under test.
const SEARCH_TERM = process.env.CRAMDEX_E2E_QUERY ?? "process";

test("dashboard shell renders with readiness and countdown", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /welcome back, operator_/i })).toBeVisible();
  await expect(page.getByText("READINESS", { exact: true })).toBeVisible();
  await expect(page.getByText("EXAM_COUNTDOWN")).toBeVisible();
  await expect(page.getByRole("link", { name: /BOOKMARKS \[\d+\]/ })).toBeVisible();
});

test("search finds a corpus term and opens the page image", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(SEARCH_TERM)}`);
  await expect(
    page.getByRole("heading", { name: /search the corpus/i })).toBeVisible();

  const chip = page.getByRole("button", { name: /Book 1 p\.\d+/ }).first();
  await expect(chip).toBeVisible();
  await chip.click();

  const img = page.getByRole("img", { name: /Book 1 page/ });
  await expect(img).toBeVisible();
  // waits for pdftoppm render on first run
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth),
          { timeout: 30_000 })
    .toBeGreaterThan(100);
});

test("quiz supports navigation, flip, grading, and book filter", async ({ page }) => {
  await page.goto("/quiz");
  await expect(page.getByRole("heading", { name: /^quiz$/i })).toBeVisible();
  await expect(page.getByText(/CARD 1\/\d+/)).toBeVisible();

  // Free navigation, both directions, without grading.
  await page.getByRole("button", { name: /next card/i }).click();
  await expect(page.getByText(/CARD 2\/\d+/)).toBeVisible();
  await page.getByRole("button", { name: /previous card/i }).click();
  await expect(page.getByText(/CARD 1\/\d+/)).toBeVisible();

  // Flip and grade.
  await page.getByRole("button", { name: /reveal answer/i }).click();
  await page.getByRole("button", { name: /hit/i }).click();
  await expect(page.getByText(/HIT: 1/)).toBeVisible();

  // Book filter narrows the deck and resets the round.
  await page.getByRole("button", { name: "Book 1", exact: true }).click();
  await expect(page.getByText(/HIT: 0/)).toBeVisible();
  await expect(page.getByText(/CARD 1\/\d+/)).toBeVisible();
});

test("book reader turns pages and records reading progress", async ({ page }) => {
  await page.goto("/books/book1");
  await expect(page.getByRole("heading", { name: /book 1/i })).toBeVisible();
  await expect(page.getByText(/P\.1\/\d+/)).toBeVisible();

  await page.getByRole("button", { name: /NEXT/ }).first().click();
  await expect(page).toHaveURL(/p=2/);

  const stored = await page.evaluate(() =>
    window.localStorage.getItem("cramdex.reading"));
  expect(stored).toContain('"lastPage":2');
});

test("exam index captures an entry from search and lists it", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(SEARCH_TERM)}`);
  await page.getByRole("button", { name: "[+INDEX]" }).first().click();
  await expect(page.getByRole("dialog", { name: /add to index/i })).toBeVisible();
  await page.getByLabel("TERM").fill("Regolith Sweep");
  await page.getByRole("button", { name: /save to index/i }).click();

  await page.goto("/index");
  await expect(page.getByRole("heading", { name: /exam index/i })).toBeVisible();
  await expect(page.getByText("Regolith Sweep").first()).toBeVisible();

  const stored = await page.evaluate(() =>
    window.localStorage.getItem("cramdex.examIndex"));
  expect(stored).toContain("Regolith Sweep");
});
