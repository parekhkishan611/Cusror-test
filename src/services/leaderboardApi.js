const LEADERBOARD_API_BASE_URL = '/api/leaderboard'
const LEADERBOARD_API_FALLBACK_URL = 'http://localhost:8787/api/leaderboard'

async function fetchWithFallback(url, options) {
  try {
    return await fetch(url, options)
  } catch {
    return fetch(LEADERBOARD_API_FALLBACK_URL, options)
  }
}

export async function fetchLeaderboard() {
  const response = await fetchWithFallback(LEADERBOARD_API_BASE_URL)

  if (!response.ok) {
    throw new Error('Failed to load leaderboard')
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}

export async function saveScoreToLeaderboard(payload) {
  const response = await fetchWithFallback(LEADERBOARD_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let details = 'Could not save score. Please try again.'
    try {
      const errorResponse = await response.json()
      if (errorResponse?.message) {
        details = errorResponse.message
      }
    } catch {
      // Keep default message when response body is not JSON.
    }
    throw new Error(details)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}
