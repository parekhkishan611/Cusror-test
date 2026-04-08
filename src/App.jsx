import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchTriviaQuestions } from './services/triviaApi'
import { fetchLeaderboard, saveScoreToLeaderboard } from './services/leaderboardApi'
import brainBustersLogo from './assets/brain-busters-logo.svg'

const CATEGORY_OPTIONS = [
  { id: '9', label: 'General Knowledge' },
  { id: '22', label: 'Geography' },
  { id: '23', label: 'History' },
  { id: '17', label: 'Science & Nature' },
  { id: '21', label: 'Sports' },
  { id: 'random', label: 'Random' },
]

function decodeHtmlEntities(value) {
  const parser = new DOMParser()
  return parser.parseFromString(value, 'text/html').documentElement.textContent ?? value
}

function normalizeQuestion(question) {
  const decodedCorrect = decodeHtmlEntities(question.correct_answer)
  const answers = [...question.incorrect_answers, question.correct_answer]
    .map((answer) => decodeHtmlEntities(answer))
    .sort(() => Math.random() - 0.5)

  return {
    category: decodeHtmlEntities(question.category),
    difficulty: decodeHtmlEntities(question.difficulty),
    prompt: decodeHtmlEntities(question.question),
    answers,
    correctAnswer: decodedCorrect,
  }
}

function App() {
  const [playerName, setPlayerName] = useState('')
  const [isEditingName, setIsEditingName] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [questions, setQuestions] = useState([])
  const [screen, setScreen] = useState('start')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [answerStatus, setAnswerStatus] = useState('')
  const [score, setScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [incorrectCount, setIncorrectCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [isSavingScore, setIsSavingScore] = useState(false)
  const [isScoreSaved, setIsScoreSaved] = useState(false)

  const currentQuestion = questions[currentQuestionIndex]
  const hasAnsweredCurrentQuestion = selectedAnswer.length > 0

  const selectedCategoryLabel = useMemo(
    () => CATEGORY_OPTIONS.find((option) => option.id === selectedCategory)?.label ?? 'Random',
    [selectedCategory],
  )

  const progressLabel = useMemo(() => {
    if (!questions.length || screen === 'complete') {
      return `${questions.length}/${questions.length}`
    }

    return `${currentQuestionIndex + 1}/${questions.length}`
  }, [questions.length, currentQuestionIndex, screen])

  const didWin = useMemo(
    () => correctCount >= Math.ceil(Math.max(questions.length, 1) * 0.6),
    [correctCount, questions.length],
  )

  const loadLeaderboard = useCallback(async () => {
    setIsLeaderboardLoading(true)
    setLeaderboardError('')
    try {
      const nextLeaderboard = await fetchLeaderboard()
      setLeaderboard(nextLeaderboard)
    } catch {
      setLeaderboardError('Global leaderboard is unavailable right now.')
    } finally {
      setIsLeaderboardLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  const loadQuestions = async () => {
    if (!playerName.trim()) {
      setError('Please enter your player name to start.')
      return
    }
    if (!selectedCategory) {
      setError('Please choose a category to start.')
      return
    }

    setIsEditingName(false)
    setIsLoading(true)
    setError('')
    setQuestions([])
    setScore(0)
    setCorrectCount(0)
    setIncorrectCount(0)
    setSelectedAnswer('')
    setAnswerStatus('')
    setCurrentQuestionIndex(0)
    setIsScoreSaved(false)
    setLeaderboardError('')

    try {
      const requestedCategory = selectedCategory === 'random' ? undefined : selectedCategory
      const rawQuestions = await fetchTriviaQuestions(10, requestedCategory)
      setQuestions(rawQuestions.map(normalizeQuestion))
      setScreen('playing')
    } catch {
      setError('Failed to load questions. Please try again.')
      setScreen('start')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAnswer = (answer) => {
    if (hasAnsweredCurrentQuestion) {
      return
    }

    const isCorrectAnswer = answer === currentQuestion.correctAnswer
    setSelectedAnswer(answer)
    setAnswerStatus(isCorrectAnswer ? 'Correct' : 'Incorrect')
    setScore((currentScore) => (isCorrectAnswer ? currentScore + 10 : currentScore - 5))
    if (isCorrectAnswer) {
      setCorrectCount((currentCount) => currentCount + 1)
    } else {
      setIncorrectCount((currentCount) => currentCount + 1)
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex + 1 >= questions.length) {
      setScreen('complete')
      return
    }

    setCurrentQuestionIndex((index) => index + 1)
    setSelectedAnswer('')
    setAnswerStatus('')
  }

  const handleResetToStart = () => {
    setScreen('start')
    setPlayerName('')
    setIsEditingName(true)
    setSelectedCategory('')
    setQuestions([])
    setCurrentQuestionIndex(0)
    setSelectedAnswer('')
    setAnswerStatus('')
    setScore(0)
    setCorrectCount(0)
    setIncorrectCount(0)
    setError('')
    setIsScoreSaved(false)
    setLeaderboardError('')
  }

  const handlePlayAgain = () => {
    setScreen('start')
    setIsEditingName(false)
    setSelectedCategory('')
    setQuestions([])
    setCurrentQuestionIndex(0)
    setSelectedAnswer('')
    setAnswerStatus('')
    setScore(0)
    setCorrectCount(0)
    setIncorrectCount(0)
    setError('')
    setIsScoreSaved(false)
    setLeaderboardError('')
  }

  const handleSaveScore = async () => {
    if (isScoreSaved || isSavingScore) {
      return
    }

    const trimmedPlayerName = playerName.trim()
    if (!trimmedPlayerName) {
      return
    }

    setIsSavingScore(true)
    setLeaderboardError('')

    try {
      const updatedLeaderboard = await saveScoreToLeaderboard({
        name: trimmedPlayerName,
        category: selectedCategoryLabel,
        score,
        correctCount,
        incorrectCount,
      })
      setLeaderboard(updatedLeaderboard)
      setIsScoreSaved(true)
    } catch {
      setLeaderboardError('Could not save score. Please try again.')
    } finally {
      setIsSavingScore(false)
    }
  }

  const getAnswerButtonClass = (answer) => {
    if (!hasAnsweredCurrentQuestion) {
      return 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
    }

    if (answer === currentQuestion.correctAnswer) {
      return 'border-emerald-500 bg-emerald-500 text-white'
    }

    if (answer === selectedAnswer) {
      return 'border-rose-500 bg-rose-500 text-white'
    }

    return 'border-slate-200 bg-slate-100 text-slate-500'
  }

  return (
    <main className="min-h-screen bg-sky-500 px-4 py-6 sm:py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-5xl justify-center">
        <div className="w-full max-w-sm rounded-[2rem] border-[7px] border-slate-900 bg-gradient-to-b from-yellow-300 to-yellow-200 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.45)] md:w-1/2 md:max-w-md">
          <div className="mb-4 flex justify-center">
            <span className="h-3 w-3 rounded-full bg-slate-900"></span>
          </div>

          <div className="min-h-[38rem] rounded-[1.5rem] border-2 border-yellow-400/80 bg-yellow-200/70 p-5 sm:p-6">
            {isLoading && (
              <section className="flex min-h-[33rem] flex-col items-center justify-center gap-4 text-center">
                <div className="h-11 w-11 animate-spin rounded-full border-4 border-slate-400 border-t-slate-900"></div>
                <p className="text-lg font-semibold text-slate-800">Loading...</p>
                <p className="text-sm text-slate-700">Fetching questions from OpenTDB</p>
              </section>
            )}

            {!isLoading && screen === 'start' && (
              <section className="flex min-h-[33rem] flex-col items-center justify-between gap-6 py-2 text-center">
                <div className="space-y-4">
                  <img
                    src={brainBustersLogo}
                    alt="Brain Busters logo"
                    className="mx-auto w-72 max-w-full sm:w-80"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-700">
                    Brain Busters
                  </p>
                  <div className="mx-auto max-w-[15.5rem] rounded-[2.2rem] border-[5px] border-slate-800 bg-white px-6 py-7 shadow-lg">
                    <p className="text-4xl font-black tracking-wide text-slate-900">TRIVIA QUIZ</p>
                  </div>
                  <p className="text-base font-semibold text-slate-700">10 questions · +10 / -5 scoring</p>
                </div>

                <div className="w-full max-w-[23rem] space-y-3 text-left">
                  {playerName.trim() && !isEditingName ? (
                    <div className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Player</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-base font-extrabold text-slate-900">{playerName}</p>
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                          onClick={() => setIsEditingName(true)}
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label
                        htmlFor="playerName"
                        className="block text-sm font-bold uppercase tracking-wide text-slate-700"
                      >
                        Player Name
                      </label>
                      <input
                        id="playerName"
                        type="text"
                        value={playerName}
                        onChange={(event) => setPlayerName(event.target.value)}
                        className="w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-slate-900"
                        placeholder="Enter your name"
                      />
                    </>
                  )}

                  <label
                    htmlFor="category"
                    className="block text-sm font-bold uppercase tracking-wide text-slate-700"
                  >
                    Category
                  </label>
                  <select
                    id="category"
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    className="w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {error && (
                    <p className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    className="mx-auto block rounded-xl border-2 border-slate-900 bg-white px-10 py-3 text-lg font-extrabold tracking-wide text-slate-900 transition hover:bg-slate-100"
                    onClick={loadQuestions}
                  >
                    START ROUND
                  </button>
                </div>
              </section>
            )}

            {!isLoading && screen === 'playing' && currentQuestion && (
              <section className="space-y-5">
                <div className="flex items-center justify-center">
                  <img src={brainBustersLogo} alt="Brain Busters logo" className="w-60 max-w-full" />
                </div>

                <header className="space-y-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                    {selectedCategoryLabel} · Question {progressLabel}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-slate-900/30 bg-white/80 px-3 py-1 text-xs font-bold text-slate-800">
                      Score: {score}
                    </span>
                    <span className="rounded-full border border-emerald-700/40 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      Correct: {correctCount}
                    </span>
                    <span className="rounded-full border border-rose-700/40 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                      Incorrect: {incorrectCount}
                    </span>
                  </div>
                </header>

                <div className="rounded-[1.5rem] border-4 border-teal-700 bg-white px-4 py-6 text-center shadow-lg">
                  <p className="text-sm font-semibold uppercase text-slate-500">
                    {currentQuestion.category} · {currentQuestion.difficulty}
                  </p>
                  <h2 className="mt-3 text-xl font-bold leading-snug text-slate-900">
                    {currentQuestion.prompt}
                  </h2>
                </div>

                <div className="grid gap-3">
                  {currentQuestion.answers.map((answer, answerIndex) => (
                    <button
                      key={`${answer}-${answerIndex}`}
                      type="button"
                      className={`w-full rounded-xl border-2 px-4 py-3 text-left text-lg font-semibold transition ${getAnswerButtonClass(answer)}`}
                      onClick={() => handleSelectAnswer(answer)}
                    >
                      <span className="mr-2 font-black text-slate-500">
                        {String.fromCharCode(65 + answerIndex)}:
                      </span>
                      {answer}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 text-center">
                  <p
                    className={`text-lg font-bold ${
                      !hasAnsweredCurrentQuestion
                        ? 'text-slate-700'
                        : answerStatus === 'Correct'
                          ? 'text-green-700'
                          : 'text-red-700'
                    }`}
                  >
                    {!hasAnsweredCurrentQuestion
                      ? 'Select an answer'
                      : answerStatus === 'Correct'
                        ? 'Correct'
                        : 'Incorrect'}
                  </p>

                  <button
                    type="button"
                    disabled={!hasAnsweredCurrentQuestion}
                    className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2 text-base font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-400 disabled:bg-slate-200 disabled:text-slate-500"
                    onClick={handleNextQuestion}
                  >
                    {currentQuestionIndex + 1 === questions.length ? 'See Results' : 'Next Question'}
                  </button>
                </div>
              </section>
            )}

            {!isLoading && screen === 'complete' && (
              <section className="flex min-h-[33rem] flex-col items-center justify-between gap-5 py-2 text-center">
                <div className="space-y-4">
                  <img src={brainBustersLogo} alt="Brain Busters logo" className="mx-auto w-60 max-w-full" />
                  <p className="text-2xl font-black uppercase tracking-wide text-slate-900">
                    {didWin ? 'You Win!' : 'Game Over'}
                  </p>
                  <div className="mx-auto max-w-[16rem] rounded-[2rem] border-4 border-slate-800 bg-white px-6 py-5 shadow-lg">
                    <p className="text-3xl font-black text-slate-900">{score} pts</p>
                    <p className="mt-2 text-sm font-semibold text-slate-600">{selectedCategoryLabel}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                      {didWin ? 'Great round!' : 'Better luck next time'}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-emerald-700/40 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      Correct: {correctCount}
                    </span>
                    <span className="rounded-full border border-rose-700/40 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                      Incorrect: {incorrectCount}
                    </span>
                  </div>
                </div>

                <div className="w-full space-y-3">
                  <button
                    type="button"
                    className="w-full rounded-xl border-2 border-emerald-700 bg-emerald-500 px-5 py-2 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    onClick={handleSaveScore}
                    disabled={isScoreSaved || isSavingScore}
                  >
                    {isSavingScore
                      ? 'Saving...'
                      : isScoreSaved
                        ? 'Saved to Leaderboard'
                        : 'Save to Leaderboard'}
                  </button>

                  <div className="rounded-xl border-2 border-slate-900 bg-white/80 p-3 text-left">
                    <p className="mb-2 text-sm font-black uppercase tracking-wide text-slate-800">
                      Scoreboard
                    </p>
                    {isLeaderboardLoading ? (
                      <p className="text-sm font-medium text-slate-600">Loading global leaderboard...</p>
                    ) : leaderboard.length === 0 ? (
                      <p className="text-sm font-medium text-slate-600">No scores yet.</p>
                    ) : (
                      <ol className="space-y-1">
                        {leaderboard.map((player, index) => (
                          <li
                            key={player.id ?? `${player.name}-${player.createdAt}-${index}`}
                            className="rounded-md bg-slate-100 px-2 py-1 text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800">
                                {index + 1}. {player.name}
                              </span>
                              <span className="font-black text-slate-900">{player.score} pts</span>
                            </div>
                            <p className="text-xs font-medium text-slate-600">
                              {player.category} · {player.correctCount}C / {player.incorrectCount}I
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                    {leaderboardError && (
                      <p className="mt-2 text-xs font-semibold text-rose-700">{leaderboardError}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-5 py-2 text-base font-bold text-slate-900 transition hover:bg-slate-100"
                      onClick={handlePlayAgain}
                    >
                      Play Again
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2 text-base font-bold text-white transition hover:bg-slate-700"
                      onClick={handleResetToStart}
                    >
                      Back to Start
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default App
