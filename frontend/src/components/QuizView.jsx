import React, { useState, useEffect, useCallback } from 'react'
import { Trophy, ChevronRight, CheckCircle, XCircle, Sparkles, Loader2, Plus, Clock, Play, Zap } from 'lucide-react'
import { generateQuiz, listQuizzes, getQuiz, submitQuiz } from '../api'

const PHASE = { LIST: 'list', PROMPT: 'prompt', PLAYING: 'playing', RESULT: 'result' }
const DIFF_STYLE = { easy: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', hard: 'bg-red-100 text-red-700' }
const PROMPT_MAX = 200

function ScoreRing({ score, total }) {
  const pct = Math.round((score / total) * 100)
  const r = 54, c = 2 * Math.PI * r, offset = c - (pct / 100) * c
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444'
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{pct}%</span>
        <span className="text-xs text-gray-400">{score}/{total}</span>
      </div>
    </div>
  )
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

function shuffleChoices(q) {
  const entries = Object.entries(q.choices)
  const shuffled = shuffle(entries)
  const newChoices = {}, keyMap = {}, keys = ['A', 'B', 'C', 'D']
  shuffled.forEach(([origKey, val], i) => { newChoices[keys[i]] = val; keyMap[origKey] = keys[i] })
  return { ...q, choices: newChoices, answer: keyMap[q.answer] || q.answer }
}

export default function QuizView({ documentId, onQuizStateChange }) {
  const [phase, setPhase] = useState(PHASE.LIST)
  const [quizHistory, setQuizHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [quizId, setQuizId] = useState(null)
  const [quizNumber, setQuizNumber] = useState(0)
  const [questions, setQuestions] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState([])
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [autoForward, setAutoForward] = useState(true)

  const notify = useCallback((active) => { if (onQuizStateChange) onQuizStateChange(active) }, [onQuizStateChange])

  useEffect(() => { fetchHistory() }, [documentId])
  useEffect(() => {
    if (phase !== PHASE.PLAYING) return
    const t = setInterval(() => setTimeElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  async function fetchHistory() {
    setLoading(true)
    try { setQuizHistory(await listQuizzes(documentId) || []) } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function handleGenerate() {
    setGenerating(true); setError('')
    try {
      const data = await generateQuiz(documentId, customPrompt)
      startQuiz(data.quizId, data.quizNumber, data.questions)
    } catch (err) {
      setError(err.code === 'RATE_LIMIT' ? 'ถึงขีดจำกัด AI วันนี้แล้ว' : (err.message || 'ไม่สามารถสร้าง Quiz ได้'))
    } finally { setGenerating(false) }
  }

  async function handlePlayExisting(qId, qNum) {
    setGenerating(true); setError('')
    try {
      const data = await getQuiz(documentId, qId)
      startQuiz(data.quizId, data.quizNumber, data.questions)
    } catch (err) {
      setError(err.message || 'ไม่สามารถโหลด Quiz ได้')
    } finally { setGenerating(false) }
  }

  function startQuiz(id, num, rawQuestions) {
    setQuizId(id); setQuizNumber(num)
    const scrambled = shuffle(rawQuestions).map(shuffleChoices)
    setQuestions(scrambled); setAnswers(new Array(scrambled.length).fill(null))
    setCurrentIdx(0); setTimeElapsed(0); setResult(null); setCustomPrompt('')
    setPhase(PHASE.PLAYING); notify(true)
  }

  function selectAnswer(key) {
    const a = [...answers]
    // Toggle: click same answer to deselect
    a[currentIdx] = a[currentIdx] === key ? null : key
    setAnswers(a)
    // Auto-forward if selecting (not deselecting) and not last question
    if (a[currentIdx] && autoForward && currentIdx < questions.length - 1) {
      setTimeout(() => setCurrentIdx((i) => i + 1), 300)
    }
  }

  function goTo(i) { setCurrentIdx(i) }

  async function handleSubmit() {
    if (answers.some((a) => !a)) return; setSubmitting(true)
    try { const data = await submitQuiz(documentId, quizId, answers); setResult(data); setPhase(PHASE.RESULT); notify(false); fetchHistory() }
    catch (err) { setError(err.message || 'ส่งคำตอบไม่สำเร็จ') } finally { setSubmitting(false) }
  }

  function backToList() { setPhase(PHASE.LIST); setResult(null); notify(false) }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (loading) return (<div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#378ADD] border-t-transparent rounded-full" /></div>)

  if (phase === PHASE.PROMPT) return (
    <div className="max-w-md mx-auto py-8 space-y-5">
      <h3 className="text-base font-semibold text-gray-900 text-center">ปรับแต่ง Quiz</h3>
      <p className="text-xs text-gray-500 text-center">บอก AI ว่าอยากได้ Quiz แบบไหน (ไม่บังคับ)</p>
      <div className="relative">
        <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value.slice(0, PROMPT_MAX))} placeholder="เช่น อยากได้ข้อสอบยากขึ้น, เน้นเรื่อง Limit, ถามเชิงประยุกต์..." rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#378ADD] resize-none" />
        <span className="absolute bottom-2 right-3 text-xs text-gray-400">{customPrompt.length}/{PROMPT_MAX}</span>
      </div>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <div className="flex gap-2 justify-center">
        <button onClick={() => setPhase(PHASE.LIST)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-60 transition-colors">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? 'กำลังสร้าง...' : 'สร้าง Quiz'}
        </button>
      </div>
    </div>
  )

  if (phase === PHASE.PLAYING && questions.length > 0) {
    const q = questions[currentIdx]
    const answeredCount = answers.filter(Boolean).length
    const allAnswered = answeredCount === questions.length
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Quiz #{quizNumber}</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setAutoForward((v) => !v)} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${autoForward ? 'border-[#378ADD] bg-blue-50 text-[#378ADD]' : 'border-gray-200 text-gray-400'}`}>
              <Zap size={10} /> Auto
            </button>
            <span className="flex items-center gap-1"><Clock size={12} />{fmtTime(timeElapsed)}</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div className="bg-[#378ADD] h-1.5 rounded-full transition-all duration-300" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#378ADD] text-white text-sm font-bold flex items-center justify-center">{currentIdx + 1}</span>
            <div>
              <p className="text-sm font-medium text-gray-900 leading-relaxed">{q.question}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${DIFF_STYLE[q.difficulty] || DIFF_STYLE.medium}`}>{q.difficulty}</span>
            </div>
          </div>
          <div className="space-y-2 pl-11">
            {Object.entries(q.choices).map(([key, val]) => {
              const sel = answers[currentIdx] === key
              return (<button key={key} onClick={() => selectAnswer(key)} className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${sel ? 'border-[#378ADD] bg-blue-50 text-[#378ADD] font-medium' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}><span className="font-semibold mr-2">{key}.</span>{val}</button>)
            })}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => goTo(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">ก่อนหน้า</button>
          <div className="flex gap-1">{questions.map((_, i) => (<button key={i} onClick={() => goTo(i)} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === currentIdx ? 'bg-[#378ADD]' : answers[i] ? 'bg-[#378ADD]/40' : 'bg-gray-300'}`} />))}</div>
          {currentIdx < questions.length - 1 ? (
            <button onClick={() => goTo(currentIdx + 1)} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] transition-colors">ถัดไป <ChevronRight size={14} /></button>
          ) : (
            <button onClick={handleSubmit} disabled={!allAnswered || submitting} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">{submitting ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />} ส่งคำตอบ</button>
          )}
        </div>
      </div>
    )
  }

  if (phase === PHASE.RESULT && result) return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-4">
        <ScoreRing score={result.score} total={result.totalQuestions} />
        <p className="text-sm font-semibold text-gray-900">{result.percentage >= 80 ? '🎉 เยี่ยมมาก!' : result.percentage >= 50 ? '👍 ดีเลย!' : '💪 พยายามต่อไป!'}</p>
        <p className="text-xs text-gray-500">เวลาที่ใช้: {fmtTime(timeElapsed)}</p>
      </div>
      {result.suggestion && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Sparkles size={14} className="text-[#378ADD]" /><span className="text-sm font-semibold text-[#378ADD]">AI แนะนำ</span></div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.suggestion}</p>
        </div>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">ทบทวนคำตอบ</h3>
        {result.results.map((r, i) => (
          <div key={i} className={`border rounded-xl p-4 ${r.isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="flex items-start gap-2">
              {r.isCorrect ? <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" /> : <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />}
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">{i + 1}. {r.question}</p>
                {!r.isCorrect && <p className="text-xs text-red-600">คุณตอบ: {r.userAnswer} → ✓ {r.correctAnswer}</p>}
                <p className="text-xs text-gray-500">{r.explanation}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-center pt-2">
        <button onClick={backToList} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">กลับ</button>
        <button onClick={() => setPhase(PHASE.PROMPT)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] transition-colors"><Plus size={14} /> สร้าง Quiz ใหม่</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">แบบทดสอบ</h3>
        <button onClick={() => setPhase(PHASE.PROMPT)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] transition-colors"><Plus size={14} /> สร้าง Quiz ใหม่</button>
      </div>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      {quizHistory.length === 0 ? (
        <div className="text-center py-12"><Trophy size={36} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-400">ยังไม่มี Quiz — สร้างแบบทดสอบแรกของคุณ</p></div>
      ) : (
        <div className="space-y-2">
          {quizHistory.map((q) => {
            const hasScore = q.score !== null && q.score !== undefined
            const pct = hasScore ? Math.round((q.score / q.totalQuestions) * 100) : null
            const pctColor = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'
            return (
              <div key={q.quizId} className="flex items-center justify-between border border-gray-200 rounded-xl bg-white px-4 py-3 hover:border-[#378ADD] transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900">Quiz #{q.quizNumber}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(q.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                    {hasScore && <span className={` ml-2 font-semibold ${pctColor}`}>{pct}% ({q.score}/{q.totalQuestions})</span>}
                    {!hasScore && <span className="ml-2 text-gray-400">ยังไม่ได้ทำ</span>}
                  </p>
                </div>
                <button onClick={() => handlePlayExisting(q.quizId, q.quizNumber)} disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-50 transition-colors">
                  {generating ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  {hasScore ? 'ทำอีกครั้ง' : 'เริ่มทำ'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
