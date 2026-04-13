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
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() ?? ''
const openAiModel = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini'
const openAiChatCompletionsUrl =
  process.env.OPENAI_CHAT_COMPLETIONS_URL?.trim() || 'https://api.openai.com/v1/chat/completions'

app.use(cors())
app.use(express.json())

app.get('/', (_request, response) => {
  const activeLeaderboardFilePath = resolveWritableLeaderboardFilePath()
  const persistedInFallbackPath = activeLeaderboardFilePath !== configuredLeaderboardFilePath

  response.status(200).json({
    service: 'brain-busters-leaderboard-api',
    status: 'ok',
    endpoints: ['/api/leaderboard', '/api/niche-questions'],
    persistence: {
      configuredFilePath: configuredLeaderboardFilePath,
      activeFilePath: activeLeaderboardFilePath,
      usingFallbackPath: persistedInFallbackPath,
    },
    nicheModeAi: {
      configured: Boolean(openAiApiKey),
      model: openAiModel,
    },
  })
})

function clampQuestionAmount(value) {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return 10
  }

  return Math.min(Math.max(Math.round(parsedValue), 1), 10)
}

function normalizeDifficulty(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
    return normalized
  }

  return 'medium'
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function dedupeAnswers(answers) {
  const seen = new Set()
  const deduped = []

  for (const answer of answers) {
    const normalizedAnswer = normalizeString(answer)
    const normalizedKey = normalizedAnswer.toLowerCase()
    if (!normalizedAnswer || seen.has(normalizedKey)) {
      continue
    }

    seen.add(normalizedKey)
    deduped.push(normalizedAnswer)
  }

  return deduped
}

function normalizeGeneratedQuestion(question) {
  if (!question || typeof question !== 'object') {
    return null
  }

  const prompt = normalizeString(question.question)
  const correctAnswer = normalizeString(question.correct_answer)
  const incorrectAnswers = Array.isArray(question.incorrect_answers)
    ? question.incorrect_answers
    : []
  const normalizedIncorrectAnswers = dedupeAnswers(incorrectAnswers).filter(
    (answer) => answer.toLowerCase() !== correctAnswer.toLowerCase(),
  )

  if (!prompt || !correctAnswer || normalizedIncorrectAnswers.length < 3) {
    return null
  }

  return {
    category: 'Niche Mode',
    difficulty: normalizeDifficulty(question.difficulty),
    question: prompt,
    correct_answer: correctAnswer,
    incorrect_answers: normalizedIncorrectAnswers.slice(0, 3),
  }
}

function normalizeGeneratedQuestions(rawQuestions, amount) {
  if (!Array.isArray(rawQuestions)) {
    throw new Error('AI service returned an invalid question format.')
  }

  const normalizedQuestions = []
  for (const rawQuestion of rawQuestions) {
    const normalizedQuestion = normalizeGeneratedQuestion(rawQuestion)
    if (normalizedQuestion) {
      normalizedQuestions.push(normalizedQuestion)
    }
    if (normalizedQuestions.length >= amount) {
      break
    }
  }

  if (normalizedQuestions.length < amount) {
    throw new Error('AI service could not generate enough valid niche questions.')
  }

  return normalizedQuestions
}

function buildNicheModePrompt(amount, modeLabel, modeDetails) {
  return [
    `Generate exactly ${amount} multiple-choice trivia questions for a quiz game.`,
    `Theme title: ${modeLabel}.`,
    modeDetails ? `Theme details: ${modeDetails}.` : '',
    'Return ONLY valid JSON with this schema:',
    '{',
    '  "questions": [',
    '    {',
    '      "category": "Niche Mode",',
    '      "difficulty": "easy|medium|hard",',
    '      "question": "Question text",',
    '      "correct_answer": "Correct option",',
    '      "incorrect_answers": ["Wrong option 1", "Wrong option 2", "Wrong option 3"]',
    '    }',
    '  ]',
    '}',
    'Rules:',
    '- Exactly 4 answer options per question (1 correct + 3 incorrect).',
    '- Incorrect answers must be plausible and unique.',
    '- Avoid trick wording and avoid "all of the above".',
    '- Use concise questions suitable for a 10-second timer.',
  ]
    .filter(Boolean)
    .join('\n')
}

function parseOpenAiErrorMessage(payload, fallbackMessage) {
  const candidateMessage =
    payload?.error?.message ||
    payload?.message ||
    (typeof payload === 'string' ? payload : '')

  if (typeof candidateMessage === 'string' && candidateMessage.trim()) {
    return candidateMessage
  }

  return fallbackMessage
}

async function generateNicheModeQuestionsWithAi(amount, modeLabel, modeDetails) {
  if (!openAiApiKey) {
    throw new Error(
      'Niche Mode AI is not configured on the server. Set OPENAI_API_KEY and try again.',
    )
  }

  const aiResponse = await fetch(openAiChatCompletionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You create high-quality trivia questions. Always return strict JSON only and follow the requested schema.',
        },
        {
          role: 'user',
          content: buildNicheModePrompt(amount, modeLabel, modeDetails),
        },
      ],
    }),
  })

  const aiPayload = await aiResponse.json().catch(() => null)

  if (!aiResponse.ok) {
    throw new Error(
      parseOpenAiErrorMessage(aiPayload, 'AI service failed while generating niche questions.'),
    )
  }

  const aiText = aiPayload?.choices?.[0]?.message?.content
  if (typeof aiText !== 'string' || !aiText.trim()) {
    throw new Error('AI service returned an empty response.')
  }

  let parsedContent
  try {
    parsedContent = JSON.parse(aiText)
  } catch {
    throw new Error('AI service returned malformed JSON.')
  }

  return normalizeGeneratedQuestions(parsedContent.questions, amount)
}

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

app.post('/api/niche-questions', async (request, response) => {
  const amount = clampQuestionAmount(request.body?.amount)
  const modeLabel = normalizeString(request.body?.modeLabel).slice(0, 80) || 'Niche Mode'
  const modeDetails = normalizeString(request.body?.modeDetails).slice(0, 240)

  try {
    const questions = await generateNicheModeQuestionsWithAi(amount, modeLabel, modeDetails)
    response.status(200).json({ questions })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not generate niche mode questions.'
    const status = message.includes('not configured') ? 503 : 500
    response.status(status).json({ message })
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
