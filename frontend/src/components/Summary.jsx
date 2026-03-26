import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { summarizeDocument } from '../api'

export default function Summary({ documentId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSummary(false)
  }, [documentId])

  async function fetchSummary(regenerate) {
    setLoading(true)
    setError('')
    try {
      const result = await summarizeDocument(documentId, regenerate)
      setData({ summary: result.summary, keyPoints: result.keyPoints })
    } catch (err) {
      if (err.code === 'RATE_LIMIT') {
        setError('ถึงขีดจำกัดการใช้งาน AI วันนี้แล้ว (50 ครั้ง/วัน)')
      } else if (err.code === 'NOT_READY') {
        setError('เอกสารยังประมวลผลไม่เสร็จ กรุณารอสักครู่')
      } else {
        setError(err.message || 'ไม่สามารถสร้างสรุปได้')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    await fetchSummary(true)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">สรุปเนื้อหา</h2>
          <hr className="border-gray-200 mb-3" />
          <div className="space-y-2 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-4 bg-gray-200 rounded ${i === 2 ? 'w-3/4' : 'w-full'}`} />
            ))}
          </div>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-red-500 mb-4">{error}</p>
        <button
          onClick={() => fetchSummary(false)}
          className="text-sm text-[#378ADD] hover:underline"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-gray-400 text-sm py-10 text-center">
        ยังไม่มีสรุปสำหรับเอกสารนี้
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">สรุปเนื้อหา</h2>
        <hr className="border-gray-200 mb-3" />
        <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Key Points</h3>
        <ul className="space-y-2">
          {data.keyPoints.map((point, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-[#378ADD] font-bold mt-0.5">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleRegenerate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] transition-colors"
        >
          <RefreshCw size={14} />
          Regenerate
        </button>
      </div>
    </div>
  )
}
