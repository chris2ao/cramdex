import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
// Node predefines a broken experimental localStorage global that shadows
// jsdom's; this installs a working in-memory Storage on window for all tests.
import "../stores/testLocalStorage";

// The full suite runs 35 test files across parallel vitest workers; under
// worker CPU contention, findBy*/waitFor's default 1000ms asyncUtilTimeout
// is occasionally too tight for a real (non-fake-timer) state update to
// commit and re-render before the poll gives up, producing an intermittent
// "Unable to find role=..." failure that never reproduces when a file is
// run in isolation (confirmed across Quiz.test.tsx and BookReader.test.tsx
// during Plan 4 Task 4's investigation). Raising the ceiling to 5000ms
// gives real updates enough runway under contention without changing what
// any test asserts: a genuinely broken UI still times out and fails, just
// with a longer budget.
configure({ asyncUtilTimeout: 5000 });
