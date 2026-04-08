import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchTriviaQuestions } from './services/triviaApi'

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
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [score, setScore] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState('')

  const currentQuestion = questions[currentQuestionIndex]

  const progressLabel = useMemo(() => {
    if (!questions.length || isComplete) {
      return `${questions.length}/${questions.length}`
    }

    return `${currentQuestionIndex + 1}/${questions.length}`
  }, [questions.length, currentQuestionIndex, isComplete])

  const loadQuestions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    setIsComplete(false)
    setScore(0)
    setSelectedAnswer('')
    setCurrentQuestionIndex(0)

    try {
      const rawQuestions = await fetchTriviaQuestions()
      setQuestions(rawQuestions.map(normalizeQuestion))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load trivia questions right now.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  const hasAnsweredCurrentQuestion = selectedAnswer.length > 0

  const handleSelectAnswer = (answer) => {
    if (hasAnsweredCurrentQuestion) {
      return
    }

    setSelectedAnswer(answer)
    if (answer === currentQuestion.correctAnswer) {
      setScore((currentScore) => currentScore + 1)
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex + 1 >= questions.length) {
      setIsComplete(true)
      return
    }

    setCurrentQuestionIndex((index) => index + 1)
    setSelectedAnswer('')
  }

  const getAnswerButtonClass = (answer) => {
    if (!hasAnsweredCurrentQuestion) {
      return 'border-slate-600 bg-slate-900/70 hover:border-blue-300 hover:bg-slate-800'
    }

    if (answer === currentQuestion.correctAnswer) {
      return 'border-emerald-400 bg-emerald-500/25'
    }

    if (answer === selectedAnswer) {
      return 'border-rose-400 bg-rose-500/25'
    }

    return 'border-slate-700 bg-slate-900/40'
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_55%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/50 backdrop-blur sm:p-8">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-blue-300">Trivia Game</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Challenge your knowledge
          </h1>
          <p className="text-sm text-slate-300 sm:text-base">
            One question at a time, ten questions total. Answers are fetched from OpenTDB.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3">
          <span className="text-sm text-slate-300">
            Progress <strong className="text-white">{progressLabel}</strong>
          </span>
          <span className="rounded-full border border-blue-400/40 bg-blue-500/20 px-3 py-1 text-sm font-medium text-blue-100">
            Score: {score}
          </span>
        </div>

        {isLoading && (
          <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-10 text-center">
            <p className="text-lg text-slate-200">Loading trivia questions...</p>
          </section>
        )}

        {!isLoading && error && (
          <section className="space-y-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-6 text-center">
            <p className="text-base text-rose-100">{error}</p>
            <button
              type="button"
              className="rounded-lg bg-rose-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-rose-300"
              onClick={loadQuestions}
            >
              Try again
            </button>
          </section>
        )}

        {!isLoading && !error && isComplete && (
          <section className="space-y-5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-6 text-center">
            <h2 className="text-2xl font-semibold text-emerald-100">Round complete!</h2>
            <p className="text-lg text-emerald-50">
              Final score: <strong>{score}</strong> / {questions.length}
            </p>
            <button
              type="button"
              className="rounded-lg bg-emerald-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300"
              onClick={loadQuestions}
            >
              Play again
            </button>
          </section>
        )}

        {!isLoading && !error && !isComplete && currentQuestion && (
          <section className="space-y-6">
            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-200">
                  {currentQuestion.category}
                </span>
                <span className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-indigo-100">
                  {currentQuestion.difficulty}
                </span>
              </div>
              <h2 className="text-xl font-semibold leading-relaxed text-white sm:text-2xl">
                {currentQuestion.prompt}
              </h2>
            </div>

            <div className="grid gap-3">
              {currentQuestion.answers.map((answer, answerIndex) => (
                <button
                  key={`${answer}-${answerIndex}`}
                  type="button"
                  className={`w-full rounded-lg border p-4 text-left text-sm font-medium text-slate-100 transition sm:text-base ${getAnswerButtonClass(answer)}`}
                  onClick={() => handleSelectAnswer(answer)}
                >
                  {answer}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-300">
                {hasAnsweredCurrentQuestion
                  ? selectedAnswer === currentQuestion.correctAnswer
                    ? 'Correct answer!'
                    : `Correct answer: ${currentQuestion.correctAnswer}`
                  : 'Select one answer to continue.'}
              </p>
              <button
                type="button"
                disabled={!hasAnsweredCurrentQuestion}
                className="rounded-lg bg-blue-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-blue-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                onClick={handleNextQuestion}
              >
                {currentQuestionIndex + 1 === questions.length ? 'See results' : 'Next question'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
