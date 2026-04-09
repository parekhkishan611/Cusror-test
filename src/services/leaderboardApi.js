const LEADERBOARD_API_BASE_URL = '/api/leaderboard'
const LEADERBOARD_API_FALLBACK_URL = 'http://localhost:8787/api/leaderboard'
const LEADERBOARD_REQUEST_TIMEOUT_MS = 8000
const LOCAL_LEADERBOARD_STORAGE_KEY = 'brain-busters-leaderboard-local-fallback'

function createRequestTimeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  }
}

async function parseErrorMessage(response) {
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const jsonBody = await response.json()
      if (jsonBody?.message && typeof jsonBody.message === 'string') {
        return jsonBody.message
      }
    }

    const textBody = await response.text()
    if (textBody.trim()) {
      return textBody
    }
  } catch {
    // If parsing fails we return a generic error.
  }

  return `Leaderboard request failed with status ${response.status}.`
}

async function requestLeaderboard(options) {
  const endpoints = [LEADERBOARD_API_BASE_URL, LEADERBOARD_API_FALLBACK_URL]
  let lastError = null

  for (const endpoint of endpoints) {
    const timeout = createRequestTimeoutSignal(LEADERBOARD_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(endpoint, { ...options, signal: timeout.signal })
      if (response.ok) {
        timeout.clear()
        return response
      }

      const message = await parseErrorMessage(response)
      lastError = new Error(message)
      timeout.clear()
    } catch (error) {
      timeout.clear()
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error('Leaderboard request timed out. Please try again.')
      } else {
        lastError = error
      }
    }
  }

  throw lastError ?? new Error('Leaderboard server is unavailable.')
}

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function sortLeaderboard(entries) {
  return [...entries]
    .sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.correctCount) - Number(a.correctCount)))
    .slice(0, 10)
}

function readLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? sortLeaderboard(parsed) : []
  } catch {
    return []
  }
}

function writeLocalLeaderboard(entries) {
  localStorage.setItem(LOCAL_LEADERBOARD_STORAGE_KEY, JSON.stringify(sortLeaderboard(entries)))
}

function mergeScore(entries, payload) {
  const normalizedName = normalizeName(payload.name)
  const existingIndex = entries.findIndex((entry) => normalizeName(entry.name) === normalizedName)
  const now = new Date().toISOString()

  if (existingIndex >= 0) {
    const existing = entries[existingIndex]
    entries[existingIndex] = {
      ...existing,
      name: payload.name,
      category: payload.category,
      score: Number(existing.score) + Number(payload.score),
      correctCount: Number(existing.correctCount) + Number(payload.correctCount),
      incorrectCount: Number(existing.incorrectCount) + Number(payload.incorrectCount),
      createdAt: now,
    }
    return sortLeaderboard(entries)
  }

  return sortLeaderboard([
    ...entries,
    {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: payload.name,
      category: payload.category,
      score: Number(payload.score),
      correctCount: Number(payload.correctCount),
      incorrectCount: Number(payload.incorrectCount),
      createdAt: now,
    },
  ])
}

export async function fetchLeaderboard() {
  try {
    const response = await requestLeaderboard()
    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid leaderboard response')
    }

    writeLocalLeaderboard(data)
    return sortLeaderboard(data)
  } catch {
    // Offline/local fallback keeps the game usable when backend is unreachable.
    return readLocalLeaderboard()
  }
}

export async function saveScoreToLeaderboard(payload) {
  try {
    const response = await requestLeaderboard({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid leaderboard response')
    }

    writeLocalLeaderboard(data)
    return sortLeaderboard(data)
  } catch {
    const currentLocal = readLocalLeaderboard()
    const mergedLocal = mergeScore(currentLocal, payload)
    writeLocalLeaderboard(mergedLocal)
    return mergedLocal
  }
}
