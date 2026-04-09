const LEADERBOARD_API_BASE_URL = '/api/leaderboard'
const LEADERBOARD_API_FALLBACK_URL = 'http://localhost:8787/api/leaderboard'

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
    try {
      const response = await fetch(endpoint, options)
      if (response.ok) {
        return response
      }

      const message = await parseErrorMessage(response)
      lastError = new Error(message)
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
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error
    }
    throw new Error('Leaderboard server is unavailable. Please run "npm run dev" and try again.')
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}
