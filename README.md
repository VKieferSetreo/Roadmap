# Roadmap

Starter-Frontend im Setreo Corporate Design.
Stack: Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Router.

Aus dem VLM-Frontend portiert, fachlicher Inhalt entfernt. Branding, Tokens, Layout-Shell, Komponenten-Library und Build-Setup bleiben.

## Start

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

## Scripts

| Befehl            | Was es macht                                                |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Vite Dev-Server                                             |
| `npm run build`   | `tsc --noEmit` + Vite Production-Build → `dist/`            |
| `npm run preview` | Vite Preview-Server des `dist/` Outputs                     |
| `npm run lint`    | ESLint mit `--max-warnings 0`                               |
| `npm run format`  | Prettier auf `src/**/*.{ts,tsx,css,md}`                     |

## Struktur

```
src/
├── api/                 # axios-Instance + TanStack QueryClient
│   ├── client.ts        # Auth-Token, X-Request-Id, X-Trace-Id, ApiError
│   └── query-client.ts
├── components/
│   ├── layout/          # AppLayout, TopBar, PageContainer, (Sidebar)
│   ├── shared/          # SetreoLogo, EmptyState, ErrorState, PageSkeleton, LoadingSpinner
│   └── ui/              # shadcn-Style Primitives (Button, Card, Dialog, …)
├── hooks/               # useDebounce
├── lib/                 # cn, format (de-DE), trace
├── pages/               # HomePage (Platzhalter)
├── styles/              # globals.css
├── main.tsx             # Entry
└── routes.tsx           # createBrowserRouter
```

## Design-Tokens

- Brand: `primary-500` = `#87B52D` (Setreo Grün), Skala 50–950 in `tailwind.config.ts`
- Fonts: Inter (Sans), JetBrains Mono (Mono) — via Google Fonts in `index.html`
- Zusätzlich semantische Tokens: `status.*`, `confidence.*`, `frist.*` (aus VLM mitgenommen, optional nutzbar)

## Environment

Siehe `.env.example`. Aktuell nur `VITE_API_BASE_URL` (default `/api`).

## Lizenz

Siehe `LICENSE`.
