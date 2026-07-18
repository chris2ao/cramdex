import { render, screen } from "@testing-library/react";
import { Assets } from "./Assets";

const ITEMS = { items: [
  { name: "dashboard.png", kind: "image", path: "assets/dashboard.png" },
]};

test("shows a loading state, then an open-in-new-tab link per asset", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ITEMS,
  })) as any);
  render(<Assets />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  const link = await screen.findByRole("link", { name: /open/i });
  expect(link).toHaveAttribute("href", expect.stringContaining("dashboard.png"));
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
