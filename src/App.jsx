import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchTriviaQuestions } from './services/triviaApi'
import { fetchLeaderboard, leaderboardMode, saveScoreToLeaderboard } from './services/leaderboardApi'
import brainBustersLogo from './assets/brain-busters-logo.svg'

const CATEGORY_OPTIONS = [
  { id: '9', label: 'General Knowledge' },
  { id: '10', label: 'Entertainment: Books' },
  { id: '11', label: 'Entertainment: Film' },
  { id: '12', label: 'Entertainment: Music' },
  { id: '14', label: 'Entertainment: Television' },
  { id: '15', label: 'Entertainment: Video Games' },
  { id: '17', label: 'Science & Nature' },
  { id: '18', label: 'Science: Computers' },
  { id: '19', label: 'Science: Mathematics' },
  { id: '20', label: 'Mythology' },
  { id: '21', label: 'Sports' },
  { id: '22', label: 'Geography' },
  { id: '23', label: 'History' },
  { id: '24', label: 'Politics' },
  { id: '25', label: 'Art' },
  { id: '27', label: 'Animals' },
  { id: 'random', label: 'Random' },
]

const NICHE_MODE_COUNT = 3

function shuffleArray(items) {
  return [...items].sort(() => Math.random() - 0.5)
}

function generateNicheModes() {
  const baseCategories = CATEGORY_OPTIONS.filter((option) => option.id !== 'random')
  const shuffledCategories = shuffleArray(baseCategories)
  const labels = ['Niche Mode: Explorer Mix', 'Niche Mode: Legends Mix', 'Niche Mode: Fusion Mix']

  return Array.from({ length: NICHE_MODE_COUNT }, (_, index) => {
    const startIndex = (index * 3) % shuffledCategories.length
    const picked = [
      shuffledCategories[startIndex],
      shuffledCategories[(startIndex + 1) % shuffledCategories.length],
      shuffledCategories[(startIndex + 2) % shuffledCategories.length],
    ]
    const categoryIds = picked.map((option) => option.id)
    const details = picked.map((option) => option.label).join(' + ')

    return {
      id: `niche-${Date.now()}-${index}-${categoryIds.join('-')}`,
      label: labels[index],
      details,
      categoryIds,
    }
  })
}

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
  const [nicheModes, setNicheModes] = useState(() => generateNicheModes())
  const [selectedNicheModeId, setSelectedNicheModeId] = useState('')
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
  const [timeLeft, setTimeLeft] = useState(10)
  const [isTimeUp, setIsTimeUp] = useState(false)
  const [isSoundEnabled, setIsSoundEnabled] = useState(true)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false)
  const audioContextRef = useRef(null)
  const endRoundSoundPlayedRef = useRef(false)

  const currentQuestion = questions[currentQuestionIndex]
  const hasAnsweredCurrentQuestion = selectedAnswer.length > 0
  const selectedCategoryLabel = useMemo(
    () => {
      if (selectedNicheModeId) {
        return nicheModes.find((mode) => mode.id === selectedNicheModeId)?.label ?? 'Niche Mode'
      }

      return CATEGORY_OPTIONS.find((option) => option.id === selectedCategory)?.label ?? 'Random'
    },
    [nicheModes, selectedCategory, selectedNicheModeId],
  )

  const progressLabel = useMemo(() => {
    if (!questions.length || screen === 'complete') {
      return `${questions.length}/${questions.length}`
    }

    return `${currentQuestionIndex + 1}/${questions.length}`
  }, [questions.length, currentQuestionIndex, screen])

  const didWin = useMemo(() => score > 60, [score])
  const timerProgress = useMemo(() => Math.max((timeLeft / 10) * 100, 0), [timeLeft])
  const isTimerCritical = timeLeft <= 3

  const leadersByCategory = useMemo(() => {
    const bestByCategory = new Map()

    for (const entry of leaderboard) {
      const category = entry.category || 'Uncategorized'
      const existing = bestByCategory.get(category)
      if (!existing || Number(entry.score) > Number(existing.score)) {
        bestByCategory.set(category, entry)
      }
    }

    return Array.from(bestByCategory.entries())
      .map(([category, entry]) => ({ category, ...entry }))
      .sort((a, b) => Number(b.score) - Number(a.score))
  }, [leaderboard])

  const overallLeaders = useMemo(() => leaderboard.slice(0, 3), [leaderboard])

  const ensureAudioReady = useCallback(async () => {
    if (!isSoundEnabled) {
      return null
    }

    if (typeof window === 'undefined') {
      return null
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      return null
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }, [isSoundEnabled])

  const playTone = useCallback(
    async ({ frequency, duration = 0.08, gain = 0.04, type = 'sine', whenOffset = 0 }) => {
      const context = await ensureAudioReady()
      if (!context) {
        return
      }

      const oscillator = context.createOscillator()
      const gainNode = context.createGain()
      const startAt = context.currentTime + whenOffset
      const endAt = startAt + duration

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, startAt)
      gainNode.gain.setValueAtTime(0.0001, startAt)
      gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt)

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(endAt + 0.01)
    },
    [ensureAudioReady],
  )

  const playTimerTickSound = useCallback(
    (nextSecond) => {
      void playTone({
        frequency: nextSecond <= 3 ? 960 : 640,
        duration: nextSecond <= 3 ? 0.09 : 0.06,
        gain: nextSecond <= 3 ? 0.045 : 0.025,
        type: nextSecond <= 3 ? 'triangle' : 'sine',
      })
    },
    [playTone],
  )

  const playCorrectSound = useCallback(() => {
    void playTone({ frequency: 660, duration: 0.08, gain: 0.045, type: 'triangle' })
    void playTone({ frequency: 880, duration: 0.12, gain: 0.05, type: 'triangle', whenOffset: 0.09 })
  }, [playTone])

  const playWrongSound = useCallback(() => {
    void playTone({ frequency: 220, duration: 0.16, gain: 0.06, type: 'sawtooth' })
    void playTone({ frequency: 160, duration: 0.16, gain: 0.05, type: 'sawtooth', whenOffset: 0.06 })
  }, [playTone])

  const playWinSound = useCallback(() => {
    void playTone({ frequency: 660, duration: 0.12, gain: 0.05, type: 'triangle' })
    void playTone({ frequency: 880, duration: 0.12, gain: 0.05, type: 'triangle', whenOffset: 0.12 })
    void playTone({ frequency: 1040, duration: 0.16, gain: 0.055, type: 'triangle', whenOffset: 0.24 })
  }, [playTone])

  const playLoseSound = useCallback(() => {
    void playTone({ frequency: 392, duration: 0.14, gain: 0.045, type: 'sine' })
    void playTone({ frequency: 330, duration: 0.18, gain: 0.04, type: 'sine', whenOffset: 0.13 })
    void playTone({ frequency: 294, duration: 0.22, gain: 0.035, type: 'sine', whenOffset: 0.28 })
  }, [playTone])

  useEffect(() => {
    if (!isSoundEnabled) {
      return
    }

    const unlockAudio = () => {
      void ensureAudioReady()
    }

    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [ensureAudioReady, isSoundEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const savedDarkMode = window.localStorage.getItem('brain-busters-dark-mode')
    if (savedDarkMode === 'true') {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem('brain-busters-dark-mode', isDarkMode ? 'true' : 'false')
  }, [isDarkMode])

  useEffect(() => {
    if (screen !== 'complete') {
      endRoundSoundPlayedRef.current = false
      return
    }

    if (endRoundSoundPlayedRef.current) {
      return
    }

    endRoundSoundPlayedRef.current = true
    if (didWin) {
      playWinSound()
    } else {
      playLoseSound()
    }
  }, [screen, didWin, playLoseSound, playWinSound])

  const handleToggleSound = () => {
    setIsSoundEnabled((current) => {
      const next = !current
      if (next) {
        void ensureAudioReady()
      }
      return next
    })
  }

  const handleToggleDarkMode = () => {
    setIsDarkMode((current) => !current)
  }

  const loadLeaderboard = useCallback(async () => {
    setIsLeaderboardLoading(true)
    setLeaderboardError('')
    try {
      const nextLeaderboard = await fetchLeaderboard()
      setLeaderboard(nextLeaderboard)
      setLeaderboardError('')
    } catch (err) {
      setLeaderboardError(err instanceof Error ? err.message : 'Leaderboard unavailable.')
    } finally {
      setIsLeaderboardLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  useEffect(() => {
    if (!isLeaderboardOpen) {
      return
    }

    loadLeaderboard()
  }, [isLeaderboardOpen, loadLeaderboard])

  useEffect(() => {
    if (!isLeaderboardOpen) {
      return
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsLeaderboardOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isLeaderboardOpen])

  const fetchNicheModeQuestions = useCallback(async (amount, categoryIds) => {
    const perCategoryAmount = Math.max(1, Math.ceil(amount / categoryIds.length))
    const results = await Promise.allSettled(
      categoryIds.map((categoryId) => fetchTriviaQuestions(perCategoryAmount, categoryId)),
    )
    const collectedQuestions = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value)

    if (collectedQuestions.length < amount) {
      const needed = amount - collectedQuestions.length
      try {
        const fallbackQuestions = await fetchTriviaQuestions(needed)
        collectedQuestions.push(...fallbackQuestions)
      } catch {
        // Use whatever niche questions were fetched successfully.
      }
    }

    if (collectedQuestions.length === 0) {
      throw new Error('Failed to load questions. Please try again.')
    }

    return shuffleArray(collectedQuestions).slice(0, amount)
  }, [])

  useEffect(() => {
    if (screen !== 'playing' || !currentQuestion || hasAnsweredCurrentQuestion) {
      return
    }

    setIsTimeUp(false)
    setTimeLeft(10)
    const timerId = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timerId)
          setSelectedAnswer('__timeout__')
          setAnswerStatus('Incorrect')
          setIsTimeUp(true)
          setScore((currentScore) => currentScore - 5)
          setIncorrectCount((currentCount) => currentCount + 1)
          playWrongSound()
          return 0
        }

        const nextSecond = previous - 1
        playTimerTickSound(nextSecond)
        return nextSecond
      })
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [
    screen,
    currentQuestion,
    hasAnsweredCurrentQuestion,
    currentQuestionIndex,
    playTimerTickSound,
    playWrongSound,
  ])

  const loadQuestions = async () => {
    void ensureAudioReady()

    if (!playerName.trim()) {
      setError('Please enter your player name to start.')
      return
    }
    if (!selectedCategory && !selectedNicheModeId) {
      setError('Please choose a category or Niche Mode to start.')
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
    setTimeLeft(10)
    setIsTimeUp(false)

    try {
      let rawQuestions
      if (selectedNicheModeId) {
        const selectedNicheMode = nicheModes.find((mode) => mode.id === selectedNicheModeId)
        if (!selectedNicheMode) {
          throw new Error('Failed to load questions. Please try again.')
        }
        rawQuestions = await fetchNicheModeQuestions(10, selectedNicheMode.categoryIds)
      } else {
        const requestedCategory = selectedCategory === 'random' ? undefined : selectedCategory
        rawQuestions = await fetchTriviaQuestions(10, requestedCategory)
      }
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

    void ensureAudioReady()
    const isCorrectAnswer = answer === currentQuestion.correctAnswer
    setSelectedAnswer(answer)
    setAnswerStatus(isCorrectAnswer ? 'Correct' : 'Incorrect')
    setIsTimeUp(false)
    if (isCorrectAnswer) {
      playCorrectSound()
    } else {
      playWrongSound()
    }
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
    setIsTimeUp(false)
    setTimeLeft(10)
  }

  const handleResetToStart = () => {
    setScreen('start')
    setPlayerName('')
    setIsEditingName(true)
    setSelectedCategory('')
    setSelectedNicheModeId('')
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
    setTimeLeft(10)
    setIsTimeUp(false)
  }

  const handlePlayAgain = () => {
    setScreen('start')
    setIsEditingName(false)
    setSelectedCategory('')
    setSelectedNicheModeId('')
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
    setTimeLeft(10)
    setIsTimeUp(false)
    setNicheModes(generateNicheModes())
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

    const leaderboardCategory = selectedNicheModeId ? 'Niche Mode' : selectedCategoryLabel

    try {
      const updatedLeaderboard = await saveScoreToLeaderboard({
        name: trimmedPlayerName,
        category: leaderboardCategory,
        score,
        correctCount,
        incorrectCount,
      })
      setLeaderboard(updatedLeaderboard)
      setIsScoreSaved(true)
      setLeaderboardError('')
    } catch (err) {
      setLeaderboardError(
        err instanceof Error
          ? err.message
          : 'Score save failed. Please verify leaderboard API configuration.',
      )
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

  const handleGenerateNicheModes = () => {
    const nextNicheModes = generateNicheModes()
    setNicheModes(nextNicheModes)
    if (selectedNicheModeId) {
      setSelectedNicheModeId(nextNicheModes[0]?.id ?? '')
    }
  }

  const rootBackgroundClass = isDarkMode ? 'bg-slate-950' : 'bg-sky-500'
  const appShellClass = isDarkMode
    ? 'border-slate-700 bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100'
    : 'border-slate-900 bg-gradient-to-b from-yellow-300 to-yellow-200'
  const screenSurfaceClass = isDarkMode
    ? 'border-slate-700 bg-slate-900/95'
    : 'border-yellow-400/80 bg-yellow-200/70'
  const topCardClass = isDarkMode
    ? 'border-slate-600 bg-slate-800 text-slate-100'
    : 'border-slate-800 bg-white/80 text-slate-900'
  const leaderboardShellClass = isDarkMode
    ? 'border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900'
    : 'border-slate-900 bg-gradient-to-b from-yellow-300 to-yellow-200'
  const leaderboardInnerClass = isDarkMode
    ? 'border-slate-600 bg-slate-800/80 text-slate-100'
    : 'border-yellow-400/80 bg-yellow-200/70'
  const leaderboardItemClass = isDarkMode
    ? 'border-slate-600 bg-slate-900/70 text-slate-100'
    : 'border-slate-900/20 bg-white/90 text-slate-900'

  return (
    <main className={`min-h-screen px-4 py-6 sm:py-8 md:px-8 ${rootBackgroundClass}`}>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-6">
        <div
          className={`w-full max-w-sm rounded-[2rem] border-[7px] p-4 shadow-[0_20px_45px_rgba(15,23,42,0.45)] sm:max-w-md ${appShellClass}`}
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className={`h-3 w-3 rounded-full ${isDarkMode ? 'bg-slate-300' : 'bg-slate-900'}`}></span>
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:grid-cols-3">
              <button
                type="button"
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${
                  isDarkMode
                    ? 'border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600'
                    : 'border-slate-700 bg-white text-slate-700 hover:bg-slate-100'
                }`}
                onClick={handleToggleDarkMode}
              >
                Theme: {isDarkMode ? 'Dark' : 'Light'}
              </button>
              <button
                type="button"
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${
                  isSoundEnabled
                    ? 'border-emerald-700 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'border-slate-700 bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
                onClick={handleToggleSound}
              >
                Sound: {isSoundEnabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${
                  isDarkMode
                    ? 'border-amber-400/70 bg-amber-200/10 text-amber-200 hover:bg-amber-200/20'
                    : 'border-slate-700 bg-white text-slate-800 hover:bg-slate-100'
                }`}
                onClick={() => setIsLeaderboardOpen(true)}
              >
                🏆 Leaders
              </button>
            </div>
          </div>

          <div className={`min-h-[38rem] rounded-[1.5rem] border-2 p-5 sm:p-6 ${screenSurfaceClass}`}>
            {isLoading && (
              <section className="flex min-h-[33rem] flex-col items-center justify-center gap-4 text-center">
                <div className="h-11 w-11 animate-spin rounded-full border-4 border-slate-400 border-t-slate-900"></div>
                <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                  Loading...
                </p>
                <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Fetching questions from OpenTDB
                </p>
              </section>
            )}

            {!isLoading && screen === 'start' && (
              <section className="flex min-h-[33rem] flex-col items-center justify-start gap-5 py-2 text-center">
                <div className={`w-full space-y-4 rounded-[1.8rem] border-4 px-4 py-5 shadow-lg ${topCardClass}`}>
                  <div className="flex w-full items-center justify-center">
                    <img
                      src={brainBustersLogo}
                      alt="Brain Busters logo"
                      className="block w-72 max-w-full object-contain sm:w-80"
                    />
                  </div>
                  <div className="space-y-2">
                    <span
                      className={`inline-block rounded-full border-2 px-4 py-1 text-xs font-black uppercase tracking-[0.2em] ${
                        isDarkMode
                          ? 'border-amber-300 bg-amber-300/25 text-amber-100'
                          : 'border-slate-800 bg-yellow-300 text-slate-900'
                      }`}
                    >
                      Ready for a challenge?
                    </span>
                    <p
                      className={`text-4xl font-black tracking-wide sm:text-5xl ${
                        isDarkMode ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      TRIVIA QUIZ
                    </p>
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Pick a category, beat the timer, and climb the global leaderboard.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-black uppercase sm:text-xs">
                    <span
                      className={`flex min-h-[3.4rem] items-center justify-center rounded-full border-2 px-2 py-1 text-center leading-tight ${
                        isDarkMode
                          ? 'border-slate-400 bg-slate-700 text-slate-100'
                          : 'border-slate-800 bg-white text-slate-800'
                      }`}
                    >
                      10 Questions
                    </span>
                    <span
                      className={`flex min-h-[3.4rem] items-center justify-center rounded-full border-2 px-2 py-1 text-center leading-tight ${
                        isDarkMode
                          ? 'border-emerald-300 bg-emerald-300/20 text-emerald-100'
                          : 'border-emerald-700 bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      +10 / -5
                    </span>
                    <span
                      className={`flex min-h-[3.4rem] items-center justify-center rounded-full border-2 px-2 py-1 text-center leading-tight ${
                        isDarkMode
                          ? 'border-rose-300 bg-rose-300/20 text-rose-100'
                          : 'border-rose-700 bg-rose-100 text-rose-800'
                      }`}
                    >
                      10s Timer
                    </span>
                  </div>
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
                    onChange={(event) => {
                      setSelectedCategory(event.target.value)
                      setSelectedNicheModeId('')
                    }}
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

                  <div className="space-y-2 rounded-xl border border-slate-800/30 bg-white/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Niche Mode
                      </p>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase text-yellow-200 transition hover:bg-slate-700"
                        onClick={handleGenerateNicheModes}
                      >
                        Generate
                      </button>
                    </div>

                    <ul className="space-y-1 text-[11px] font-semibold text-slate-700">
                      {nicheModes.map((mode) => (
                        <li key={mode.id}>
                          <button
                            type="button"
                            className={`w-full rounded-md border px-2 py-1 text-left transition ${
                              selectedNicheModeId === mode.id
                                ? 'border-slate-900 bg-slate-900 text-yellow-200'
                                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              setSelectedNicheModeId(mode.id)
                              setSelectedCategory('')
                            }}
                          >
                            <span className="font-black">{mode.label.replace('Niche Mode: ', '')}</span>
                            <span className="block text-[10px] font-semibold opacity-90">{mode.details}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

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
                <div className="flex w-full items-center justify-center">
                  <img
                    src={brainBustersLogo}
                    alt="Brain Busters logo"
                    className="block w-60 max-w-full object-contain"
                  />
                </div>

                <header className="space-y-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                    {selectedCategoryLabel} · Question {progressLabel}
                  </p>
                  <div className="space-y-1 rounded-xl border border-slate-900/20 bg-white/70 px-3 py-2">
                    <div className="flex items-center justify-between text-xs font-bold uppercase">
                      <span className={isTimerCritical ? 'text-rose-700' : 'text-slate-700'}>
                        Time Left
                      </span>
                      <span className={isTimerCritical ? 'text-rose-700' : 'text-slate-900'}>
                        {timeLeft}s
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all duration-500 ${isTimerCritical ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${timerProgress}%` }}
                      />
                    </div>
                  </div>
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
                      isTimeUp
                        ? 'text-rose-700'
                        : !hasAnsweredCurrentQuestion
                        ? 'text-slate-700'
                        : answerStatus === 'Correct'
                          ? 'text-green-700'
                          : 'text-red-700'
                    }`}
                  >
                    {isTimeUp
                      ? "Time's up! -5 points"
                      : !hasAnsweredCurrentQuestion
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
                  <div className="flex w-full items-center justify-center">
                    <img
                      src={brainBustersLogo}
                      alt="Brain Busters logo"
                      className="block w-60 max-w-full object-contain"
                    />
                  </div>
                  <p className="text-2xl font-black uppercase tracking-wide text-slate-900">Game Over</p>
                  <div className="mx-auto max-w-[16rem] rounded-[2rem] border-4 border-slate-800 bg-white px-6 py-5 shadow-lg">
                    <p className="text-3xl font-black text-slate-900">{score} pts</p>
                    <p className="mt-2 text-sm font-semibold text-slate-600">{selectedCategoryLabel}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                      {didWin ? 'You won this game!' : 'You lost'}
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

        {isLeaderboardOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-[1px]">
            <div
              className="absolute inset-0"
              onClick={() => setIsLeaderboardOpen(false)}
              aria-label="Close leaderboard overlay"
            />
            <aside
              className={`relative z-10 w-full max-w-[22rem] rounded-3xl border-[7px] p-4 shadow-[0_20px_45px_rgba(15,23,42,0.45)] ${leaderboardShellClass}`}
            >
            <div className={`rounded-2xl border-2 p-4 ${leaderboardInnerClass}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className={`text-sm font-black uppercase tracking-wide ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                    Global Leaderboard
                  </p>
                  <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Top leaders</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                      isDarkMode
                        ? 'border-slate-500 bg-slate-700 text-slate-200'
                        : 'border-slate-300 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {leaderboardMode === 'global' ? 'Global' : 'Local'}
                  </span>
                  <button
                    type="button"
                    className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${
                      isDarkMode
                        ? 'border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600'
                        : 'border-slate-700 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                    onClick={() => setIsLeaderboardOpen(false)}
                  >
                    Back to Game
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${
                      isDarkMode
                        ? 'border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600'
                        : 'border-slate-700 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                    onClick={loadLeaderboard}
                    disabled={isLeaderboardLoading}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {isLeaderboardLoading ? (
                <p
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    isDarkMode
                      ? 'border-slate-600 bg-slate-800 text-slate-200'
                      : 'border-slate-300 bg-white/80 text-slate-600'
                  }`}
                >
                  Loading {leaderboardMode} leaderboard...
                </p>
              ) : leaderboard.length === 0 ? (
                <p
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    isDarkMode
                      ? 'border-slate-600 bg-slate-800 text-slate-200'
                      : 'border-slate-300 bg-white/80 text-slate-600'
                  }`}
                >
                  No scores yet. Be the first player!
                </p>
              ) : (
                <div className="space-y-3">
                  <section className="space-y-2">
                    <h3 className={`text-xs font-black uppercase tracking-wide ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      Overall Leaders
                    </h3>
                    <ol className="space-y-2">
                      {overallLeaders.map((player, index) => {
                        const trophy = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null
                        return (
                          <li
                            key={player.id ?? `${player.name}-${player.createdAt}-${index}`}
                            className={`rounded-xl border-2 px-3 py-2 ${leaderboardItemClass}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-extrabold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                  {trophy ? `${trophy} ` : `${index + 1}. `}
                                  {player.name}
                                </p>
                                <p className={`mt-1 truncate text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                  Top category: {player.category}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className={`text-lg font-black ${isDarkMode ? 'text-yellow-200' : 'text-slate-900'}`}>{player.score}</p>
                                <p className={`text-[10px] font-semibold uppercase ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Score</p>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </section>

                  <section className="space-y-2">
                    <h3 className={`text-xs font-black uppercase tracking-wide ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      Leaders by Category
                    </h3>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {leadersByCategory.map((entry) => (
                        <div
                          key={entry.category}
                          className={`rounded-xl border-2 px-3 py-2 ${leaderboardItemClass}`}
                        >
                          <p className={`truncate text-[11px] font-black uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {entry.category}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className={`truncate text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{entry.name}</p>
                            <p className={`text-sm font-black ${isDarkMode ? 'text-yellow-200' : 'text-slate-900'}`}>{entry.score}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {leaderboardError && (
                <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${isDarkMode ? 'border-rose-400/70 bg-rose-900/35 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-700'}`}>
                  {leaderboardError}
                </p>
              )}
            </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}

export default App
