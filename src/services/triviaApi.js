const OPENTDB_API_ENDPOINT = 'https://opentdb.com/api.php'

export async function fetchTriviaQuestions(amount = 10) {
  try {
    const query = new URLSearchParams({ amount: String(amount) })
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
