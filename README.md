# Brain Busters (React + Tailwind + Express)

Brain Busters is a responsive trivia web app with a game-style UI, category selection, and a global leaderboard backed by a local server.

## Features

- One-question-at-a-time gameplay with immediate correct/incorrect feedback
- Score rules: **+10** for correct answers and **-5** for incorrect answers
- Category selector (5 categories + Random)
- Live counters for correct and incorrect answers
- End-of-round result screen with explicit **Game Over** state for losing rounds
- Global leaderboard API (`GET/POST /api/leaderboard`) with server-side persistence

## Trivia source

Questions are fetched from OpenTDB via:

`https://opentdb.com/api.php`

The app requests 10 multiple-choice questions per round and optionally applies a category filter.

## Run locally

Install dependencies:

```bash
npm install
```

Start leaderboard server (port 8787):

```bash
npm run server
```

In a second terminal, start the frontend (port 5173):

```bash
npm run dev
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8787`.

## Build and lint

```bash
npm run lint
npm run build
```
