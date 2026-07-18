import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "./Lightbox";
import { MarkdownView } from "./MarkdownView";

test("does not leak react-markdown's node prop onto DOM elements", () => {
  const { container } = render(
    <MemoryRouter><LightboxProvider>
      <MarkdownView markdown={"hello **world**\n\n- item"} />
    </LightboxProvider></MemoryRouter>
  );
  for (const el of container.querySelectorAll("p, strong, li, ul")) {
    expect(el.getAttribute("node")).toBeNull();
  }
});
