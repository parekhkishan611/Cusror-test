const LEADERBOARD_API_BASE_URL = '/api/leaderboard'

export async function fetchLeaderboard() {
  const response = await fetch(LEADERBOARD_API_BASE_URL)

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
  const response = await fetch(LEADERBOARD_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('Failed to save score')
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid leaderboard response')
  }

  return data
}
