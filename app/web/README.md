# Cramdex web frontend

A small React and TypeScript frontend for browsing and searching the active
course pack: full-text search over the course books, an Ask page grounded
in cited passages, a glossary, a slide index, lab write-ups, cheatsheets,
and a quiz. It talks to the FastAPI backend in `app/server`.

## Development

Run the backend and the frontend dev server side by side:

```bash
uvicorn main:app --app-dir app/server --port 8553 --reload
npm run dev
```

The Vite dev server proxies `/api` requests to the backend on port 8553.

## Testing

```bash
npm test       # unit and component tests (Vitest + Testing Library)
npm run build  # type-check and production build
npm run e2e    # Playwright end-to-end tests
```
