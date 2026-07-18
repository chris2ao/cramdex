import { render, screen } from "@testing-library/react";
import { HealthBanner } from "./HealthBanner";

test("renders nothing while the health check has not resolved", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as any);
  const { container } = render(<HealthBanner />);
  expect(container).toBeEmptyDOMElement();
});

test("renders nothing when the health check reports ok", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ ok: true, checks: {} }),
  })) as any);
  const { container } = render(<HealthBanner />);
  await new Promise((r) => setTimeout(r, 0));
  expect(container).toBeEmptyDOMElement();
});

test("surfaces a red banner listing failing checks", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ ok: false, checks: { poppler: false, corpus_db: true } }),
  })) as any);
  render(<HealthBanner />);
  expect(await screen.findByText(/poppler missing/i)).toBeInTheDocument();
});

test("surfaces the llm fix message when no LLM provider is configured", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ ok: false, checks: { llm: false, corpus_db: true } }),
  })) as any);
  render(<HealthBanner />);
  expect(await screen.findByText(/no llm provider configured/i)).toBeInTheDocument();
});

test("surfaces the same red banner styling when the health fetch itself fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false, statusText: "Service Unavailable", json: async () => ({ detail: "backend down" }),
  })) as any);
  render(<HealthBanner />);
  expect(await screen.findByText(/health check failed: backend down/i)).toBeInTheDocument();
});
