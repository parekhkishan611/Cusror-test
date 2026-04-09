# Brain Busters (React + Tailwind + Express)

Brain Busters is a responsive trivia web app with a game-style UI, category selection, and a global leaderboard backed by a local server.

## Features

- One-question-at-a-time gameplay with immediate correct/incorrect feedback
- Score rules: **+10** for correct answers and **-5** for incorrect answers
- Expanded category selector (OpenTDB categories + Random)
- Live counters for correct and incorrect answers
- End-of-round result screen with explicit **Game Over** state for losing rounds
- Leaderboard modes:
  - **Global** when `VITE_LEADERBOARD_API_URL` is configured
  - **Local fallback** for offline/local reliability

## Trivia source

Questions are fetched from OpenTDB via:

`https://opentdb.com/api.php`

The app requests 10 multiple-choice questions per round and optionally applies a category filter.

## Run locally

Install dependencies:

```bash
npm install
```

Start both frontend and backend together (recommended):

```bash
npm run dev
```

This starts:
- frontend on `http://localhost:5173` (or next free Vite port)
- leaderboard server on `http://localhost:8787`

If you only want the client:

```bash
npm run dev:client
```

If you only want the leaderboard server:

```bash
npm run server
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8787`.

## Make leaderboard truly global

To make the leaderboard shared across all users:

1. Deploy the leaderboard backend to a public URL (for example on Render, Railway, Fly, etc.).
2. Expose these endpoints:
   - `GET /api/leaderboard`
   - `POST /api/leaderboard`
3. Set frontend environment variable to that full endpoint URL:

```bash
VITE_LEADERBOARD_API_URL=https://your-api-domain.com/api/leaderboard
```

In Vercel, set this under **Project Settings → Environment Variables** and redeploy.

When this variable is set, the app runs in **Global** leaderboard mode.

## Build and lint

```bash
npm run lint
npm run build
```
