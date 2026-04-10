import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const defaultLeaderboardPort = 8787
const port = Number(process.env.LEADERBOARD_PORT) || defaultLeaderboardPort

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultDataDirectory = path.join(__dirname, 'data')
const configuredLeaderboardFilePath = process.env.LEADERBOARD_FILE_PATH
  ? path.resolve(process.env.LEADERBOARD_FILE_PATH)
  : path.join(defaultDataDirectory, 'leaderboard.json')

app.use(cors())
app.use(express.json())

app.get('/', (_request, response) => {
  const activeLeaderboardFilePath = resolveWritableLeaderboardFilePath()
  const persistedInFallbackPath = activeLeaderboardFilePath !== configuredLeaderboardFilePath

  response.status(200).json({
    service: 'brain-busters-leaderboard-api',
    status: 'ok',
    endpoints: ['/api/leaderboard'],
    persistence: {
      configuredFilePath: configuredLeaderboardFilePath,
      activeFilePath: activeLeaderboardFilePath,
      usingFallbackPath: persistedInFallbackPath,
    },
  })
})

function resolveWritableLeaderboardFilePath() {
  try {
    const directory = path.dirname(configuredLeaderboardFilePath)
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
    return configuredLeaderboardFilePath
  } catch {
    if (configuredLeaderboardFilePath !== path.join(defaultDataDirectory, 'leaderboard.json')) {
      const fallbackDirectory = defaultDataDirectory
      if (!fs.existsSync(fallbackDirectory)) {
        fs.mkdirSync(fallbackDirectory, { recursive: true })
      }
      return path.join(fallbackDirectory, 'leaderboard.json')
    }

    throw new Error('No writable leaderboard path available.')
  }
}

function ensureLeaderboardFile() {
  const activeLeaderboardFilePath = resolveWritableLeaderboardFilePath()
  if (!fs.existsSync(activeLeaderboardFilePath)) {
    fs.writeFileSync(activeLeaderboardFilePath, JSON.stringify([], null, 2), 'utf-8')
  }
  return activeLeaderboardFilePath
}

function readLeaderboard() {
  const activeLeaderboardFilePath = ensureLeaderboardFile()
  const data = fs.readFileSync(activeLeaderboardFilePath, 'utf-8')
  const parsed = JSON.parse(data)
  return Array.isArray(parsed) ? parsed : []
}

function sortLeaderboard(entries) {
  return entries.sort((a, b) => (b.score - a.score) || (b.correctCount - a.correctCount))
}

function writeLeaderboard(entries) {
  const activeLeaderboardFilePath = ensureLeaderboardFile()
  fs.writeFileSync(activeLeaderboardFilePath, JSON.stringify(sortLeaderboard(entries), null, 2), 'utf-8')
}

function createEntryId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `bb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

app.get('/api/leaderboard', (_request, response) => {
  try {
    const leaderboard = sortLeaderboard(readLeaderboard())
    response.json(leaderboard)
  } catch {
    response.status(500).json({ message: 'Could not load leaderboard.' })
  }
})

app.post('/api/leaderboard', (request, response) => {
  const { name, category, score, correctCount, incorrectCount } = request.body ?? {}

  if (!name || typeof name !== 'string') {
    response.status(400).json({ message: 'Name is required.' })
    return
  }

  if (!category || typeof category !== 'string') {
    response.status(400).json({ message: 'Category is required.' })
    return
  }

  const parsedScore = Number(score)
  const parsedCorrectCount = Number(correctCount)
  const parsedIncorrectCount = Number(incorrectCount)

  if (
    !Number.isFinite(parsedScore) ||
    !Number.isFinite(parsedCorrectCount) ||
    !Number.isFinite(parsedIncorrectCount)
  ) {
    response.status(400).json({ message: 'Invalid score payload.' })
    return
  }

  try {
    const leaderboard = readLeaderboard()
    const trimmedName = name.trim().slice(0, 30)
    const normalizedName = normalizeName(trimmedName)
    const now = new Date().toISOString()
    const existingEntryIndex = leaderboard.findIndex(
      (entry) => normalizeName(entry.name) === normalizedName,
    )

    if (existingEntryIndex >= 0) {
      const existingEntry = leaderboard[existingEntryIndex]
      leaderboard[existingEntryIndex] = {
        ...existingEntry,
        name: trimmedName,
        category: category.trim().slice(0, 40),
        score: Number(existingEntry.score) + parsedScore,
        correctCount: Number(existingEntry.correctCount) + parsedCorrectCount,
        incorrectCount: Number(existingEntry.incorrectCount) + parsedIncorrectCount,
        createdAt: now,
      }
    } else {
      leaderboard.push({
        id: createEntryId(),
        name: trimmedName,
        category: category.trim().slice(0, 40),
        score: parsedScore,
        correctCount: parsedCorrectCount,
        incorrectCount: parsedIncorrectCount,
        createdAt: now,
      })
    }
    const updatedLeaderboard = sortLeaderboard(leaderboard)
    writeLeaderboard(updatedLeaderboard)
    response.status(201).json(updatedLeaderboard)
  } catch {
    response.status(500).json({ message: 'Could not save leaderboard.' })
  }
})

app.delete('/api/leaderboard', (_request, response) => {
  try {
    writeLeaderboard([])
    response.status(200).json([])
  } catch {
    response.status(500).json({ message: 'Could not reset leaderboard.' })
  }
})

app.listen(port, () => {
  ensureLeaderboardFile()
  console.log(`Brain Busters leaderboard server listening on port ${port}`)
})
