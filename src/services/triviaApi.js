const OPENTDB_API_ENDPOINT = 'https://opentdb.com/api.php'
const NICHE_MODE_API_ENDPOINT = '/api/niche-questions'

export async function fetchTriviaQuestions(amount = 10, category) {
  try {
    const queryParams = {
      amount: String(amount),
      type: 'multiple',
    }

    if (category) {
      queryParams.category = String(category)
    }

    const query = new URLSearchParams(queryParams)
    const response = await fetch(`${OPENTDB_API_ENDPOINT}?${query.toString()}`)

    if (!response.ok) {
      throw new Error('Failed to load questions. Please try again.')
    }

    const data = await response.json()

    if (data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('Failed to load questions. Please try again.')
    }

    return data.results
  } catch {
    throw new Error('Failed to load questions. Please try again.')
  }
}

function parseApiErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (typeof payload === 'object' && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message
  }

  return fallbackMessage
}

export async function fetchAiNicheModeQuestions(amount = 10, modeLabel, modeDetails) {
  try {
    const response = await fetch(NICHE_MODE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        modeLabel,
        modeDetails,
      }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(
        parseApiErrorMessage(payload, 'Failed to generate niche mode questions. Please try again.'),
      )
    }

    if (!Array.isArray(payload?.questions) || payload.questions.length === 0) {
      throw new Error('Failed to generate niche mode questions. Please try again.')
    }

    return payload.questions
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to generate niche mode questions. Please try again.')
  }
}
