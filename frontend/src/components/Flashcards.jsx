import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, RefreshCw } from 'lucide-react'
import { generateFlashcards } from '../api'

export default function Flashcards({ documentId }) {
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCards(false)
  }, [documentId])

  async function fetchCards(regenerate) {
    setLoading(true)
    setError('')
    try {
      const data = await generateFlashcards(documentId, regenerate)
      setCards(data.flashcards || [])
      setIndex(0)
      setFlipped(false)
    } catch (err) {
      if (err.code === 'RATE_LIMIT') {
        setError('ถึงขีดจำกัดการใช้งาน AI วันนี้แล้ว (50 ครั้ง/วัน)')
      } else if (err.code === 'NOT_READY') {
        setError('เอกสารยังประมวลผลไม่เสร็จ กรุณารอสักครู่')
      } else {
        setError(err.message || 'ไม่สามารถสร้าง Flashcard ได้')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="animate-spin w-6 h-6 border-2 border-[#378ADD] border-t-transparent rounded-full" />
        <p className="text-sm text-gray-500">กำลังสร้าง Flashcard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-red-500 mb-4">{error}</p>
        <button
          onClick={() => fetchCards(false)}
          className="text-sm text-[#378ADD] hover:underline"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="text-gray-400 text-sm text-center py-10">
        ยังไม่มี Flashcard สำหรับเอกสารนี้
      </div>
    )
  }

  const card = cards[index]
  const total = cards.length

  function prev() {
    setFlipped(false)
    setTimeout(() => setIndex((i) => (i - 1 + total) % total), flipped ? 150 : 0)
  }

  function next() {
    setFlipped(false)
    setTimeout(() => setIndex((i) => (i + 1) % total), flipped ? 150 : 0)
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-500 font-medium">
          การ์ด {index + 1} / {total}
        </p>
        <button
          onClick={() => fetchCards(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[#378ADD] rounded-lg hover:bg-blue-50 transition-colors"
        >
          <RefreshCw size={12} />
          สร้างใหม่
        </button>
      </div>

      <div
        className="w-full max-w-xl h-64 cursor-pointer select-none"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped((v) => !v)}
      >
        <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
          <div className="flashcard-face bg-white border border-gray-200 text-gray-900">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#378ADD]">
                คำถาม
              </span>
              <p className="text-base font-medium leading-relaxed">{card.front}</p>
              <span className="text-xs text-gray-400 mt-2">คลิกเพื่อดูคำตอบ</span>
            </div>
          </div>
          <div className="flashcard-face flashcard-back bg-[#378ADD] border border-[#378ADD] text-white">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-100">
                คำตอบ
              </span>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{card.back}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={prev}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={16} />
          ก่อนหน้า
        </button>
        <button
          onClick={() => setFlipped(false)}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          title="พลิกกลับ"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={next}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          ถัดไป
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex gap-1.5">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => { setFlipped(false); setIndex(i) }}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === index ? 'bg-[#378ADD]' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
