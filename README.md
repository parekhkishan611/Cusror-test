# Trivia Game (React + Tailwind CSS)

A responsive trivia web app built with React, Vite, and Tailwind CSS.

## Features

- Professional dark-themed, responsive UI
- Fetches trivia data from OpenTDB
- Loads 10 questions per round
- Shows one question at a time
- Tracks score and progress
- Supports replaying a new round

## API

Questions are fetched from:

`https://opentdb.com/api.php?amount=10`

The app uses `src/services/triviaApi.js` to retrieve and validate question data.

## Run locally

```bash
npm install
npm run dev
```

## Build and lint

```bash
npm run lint
npm run build
```
