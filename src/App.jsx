import { useMemo, useState } from 'react'
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
  const [screen, setScreen] = useState('start')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [answerStatus, setAnswerStatus] = useState('')
  const [score, setScore] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const currentQuestion = questions[currentQuestionIndex]

  const progressLabel = useMemo(() => {
    if (!questions.length || screen === 'complete') {
      return `${questions.length}/${questions.length}`
    }

    return `${currentQuestionIndex + 1}/${questions.length}`
  }, [questions.length, currentQuestionIndex, screen])

  const hasAnsweredCurrentQuestion = selectedAnswer.length > 0

  const loadQuestions = async () => {
    setIsLoading(true)
    setError('')
    setScore(0)
    setSelectedAnswer('')
    setAnswerStatus('')
    setCurrentQuestionIndex(0)

    try {
      const rawQuestions = await fetchTriviaQuestions(10)
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

    setSelectedAnswer(answer)
    const isCorrectAnswer = answer === currentQuestion.correctAnswer
    setAnswerStatus(isCorrectAnswer ? 'Correct' : 'Incorrect')

    if (isCorrectAnswer) {
      setScore((currentScore) => currentScore + 1)
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
    setQuestions([])
    setCurrentQuestionIndex(0)
    setSelectedAnswer('')
    setAnswerStatus('')
    setScore(0)
    setError('')
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
    <main className="min-h-screen bg-sky-500 px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-sm rounded-[2rem] border-6 border-slate-900 bg-gradient-to-b from-yellow-300 to-yellow-200 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.45)] md:w-1/2 md:max-w-md">
          <div className="mb-3 flex justify-center">
            <span className="h-3 w-3 rounded-full bg-slate-900"></span>
          </div>

          <div className="min-h-[32rem] rounded-[1.4rem] border border-yellow-400/80 bg-yellow-200/60 p-5 sm:p-6">
            {isLoading && (
              <section className="flex h-full min-h-[27rem] flex-col items-center justify-center gap-4 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-400 border-t-slate-900"></div>
                <p className="text-lg font-semibold text-slate-800">Loading...</p>
                <p className="text-sm text-slate-600">Fetching trivia questions from OpenTDB</p>
              </section>
            )}

            {!isLoading && screen === 'start' && (
              <section className="flex h-full min-h-[27rem] flex-col items-center justify-between py-6 text-center">
                <div className="space-y-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-700">
                    Trivia Challenge
                  </p>
                  <div className="mx-auto max-w-[15rem] rounded-[2.2rem] border-4 border-slate-800 bg-white px-6 py-8 shadow-lg">
                    <p className="text-4xl font-black tracking-wide text-slate-900">QUIZ</p>
                  </div>
                  <p className="text-sm font-medium text-slate-700">10 questions · One at a time</p>
                </div>

                <div className="space-y-4">
                  {error && (
                    <p className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-700">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    className="rounded-xl border-2 border-slate-900 bg-white px-8 py-3 text-lg font-extrabold tracking-wide text-slate-900 transition hover:bg-slate-100"
                    onClick={loadQuestions}
                  >
                    START
                  </button>
                </div>
              </section>
            )}

            {!isLoading && screen === 'playing' && currentQuestion && (
              <section className="space-y-5">
                <header className="space-y-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                    Question {progressLabel}
                  </p>
                  <div className="mx-auto inline-flex rounded-full border border-slate-900/20 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                    Score: {score}
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
              <section className="flex h-full min-h-[27rem] flex-col items-center justify-between py-6 text-center">
                <div className="space-y-4">
                  <p className="text-2xl font-black uppercase tracking-wide text-slate-900">
                    Congratulations!
                  </p>
                  <div className="mx-auto max-w-[14rem] rounded-[2.2rem] border-4 border-slate-800 bg-white px-6 py-7 shadow-lg">
                    <p className="text-4xl font-black text-slate-900">
                      {score >= Math.ceil(questions.length * 0.6) ? 'YOU WIN!' : 'ROUND OVER'}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-slate-700">
                    Final score: {score} / {questions.length}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-xl border-2 border-slate-900 bg-white px-5 py-2 text-base font-bold text-slate-900 transition hover:bg-slate-100"
                    onClick={loadQuestions}
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2 text-base font-bold text-white transition hover:bg-slate-700"
                    onClick={handleResetToStart}
                  >
                    Back to Start
                  </button>
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
