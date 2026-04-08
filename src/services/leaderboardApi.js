const LEADERBOARD_API_BASE_URL = '/api/leaderboard'
const LEADERBOARD_API_FALLBACK_URL = 'http://localhost:8787/api/leaderboard'

async function requestLeaderboard(options) {
  const endpoints = [LEADERBOARD_API_BASE_URL, LEADERBOARD_API_FALLBACK_URL]
  let lastError

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, options)
      if (response.ok) {
        return response
      }

      lastError = new Error(`Leaderboard request failed with status ${response.status}.`)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Leaderboard server is unavailable.')
}

export async function fetchLeaderboard() {
  const response = await requestLeaderboard()

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}

export async function saveScoreToLeaderboard(payload) {
  let response
  try {
    response = await requestLeaderboard({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Leaderboard server is unavailable. Please run "npm run dev" and try again.')
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}
