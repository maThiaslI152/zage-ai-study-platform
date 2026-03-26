import React, { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { chatWithDocument } from '../api'

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-4 py-3">
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
    </div>
  )
}

export default function Chat({ documentId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isTyping) return

    const userMsg = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: text,
    }

    setMessages((m) => [...m, userMsg])
    setInput('')
    setIsTyping(true)
    setError('')

    try {
      const data = await chatWithDocument(documentId, text)

      const aiMsg = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: data.reply,
      }
      setMessages((m) => [...m, aiMsg])
    } catch (err) {
      if (err.code === 'RATE_LIMIT') {
        setError('ถึงขีดจำกัดการใช้งาน AI วันนี้แล้ว (50 ครั้ง/วัน)')
      } else {
        setError(err.message || 'ไม่สามารถส่งข้อความได้')
      }
    } finally {
      setIsTyping(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[520px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isTyping && (
          <p className="text-center text-gray-400 text-sm pt-10">
            ถามคำถามเกี่ยวกับเอกสารได้เลย
          </p>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                  ${isUser
                    ? 'bg-[#dbeafe] text-gray-900 rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
              >
                {msg.content}
              </div>
            </div>
          )
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-500 text-center">{error}</div>
      )}

      <div className="border-t border-gray-200 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="พิมพ์คำถามของคุณ..."
          disabled={isTyping}
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#378ADD] disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isTyping}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          ส่ง
        </button>
      </div>
    </div>
  )
}
