import { render, screen } from "@testing-library/react";
import { Loading } from "./Loading";

test("renders a muted loading message", () => {
  render(<Loading />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
