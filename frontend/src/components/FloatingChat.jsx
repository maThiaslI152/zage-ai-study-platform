import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import Markdown from 'react-markdown'
import { chatWithDocument } from '../api'

const CHAT_LIMIT = 20

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-4 py-3">
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
    </div>
  )
}

export default function FloatingChat({ documentId }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(CHAT_LIMIT)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Reset when document changes
  useEffect(() => {
    setMessages([])
    setRemaining(CHAT_LIMIT)
    setError('')
  }, [documentId])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isTyping || remaining <= 0) return

    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: text }])
    setInput('')
    setIsTyping(true)
    setError('')

    try {
      const data = await chatWithDocument(documentId, text)
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: data.reply }])
      if (data.remaining !== undefined) setRemaining(data.remaining)
    } catch (err) {
      if (err.code === 'DOC_CHAT_LIMIT') {
        setRemaining(0)
        setError('ถึงขีดจำกัดการถามสำหรับเอกสารนี้แล้ว')
      } else if (err.code === 'RATE_LIMIT') {
        setError('ถึงขีดจำกัด AI วันนี้แล้ว')
      } else {
        setError('ไม่สามารถส่งข้อความได้')
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

  const limitColor = remaining <= 3 ? 'text-red-500' : remaining <= 8 ? 'text-yellow-600' : 'text-gray-400'

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 h-[480px] bg-white border border-gray-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#378ADD] text-white rounded-t-2xl">
            <div>
              <span className="text-sm font-semibold">ถามเกี่ยวกับเอกสาร</span>
              <span className={`ml-2 text-xs ${remaining <= 3 ? 'text-red-200' : 'text-blue-100'}`}>
                เหลือ {remaining}/{CHAT_LIMIT}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && !isTyping && (
              <p className="text-center text-gray-400 text-xs pt-8">ถามคำถามเกี่ยวกับเอกสารได้เลย</p>
            )}
            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed
                    ${isUser ? 'bg-[#dbeafe] text-gray-900 rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                    {isUser ? msg.content : <Markdown className="prose prose-xs max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 [&_table]:text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1 [&_th]:border [&_td]:border [&_th]:border-gray-300 [&_td]:border-gray-300">{msg.content}</Markdown>}
                  </div>
                </div>
              )
            })}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm"><TypingIndicator /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="px-3 py-1 text-xs text-red-500 text-center">{error}</div>}

          {/* Remaining indicator */}
          {remaining <= 5 && remaining > 0 && (
            <div className={`px-3 py-1 text-center text-xs ${limitColor}`}>
              เหลืออีก {remaining} ข้อความ
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-200 p-2 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={remaining <= 0 ? 'ถึงขีดจำกัดแล้ว' : 'พิมพ์คำถาม...'}
              disabled={isTyping || remaining <= 0}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#378ADD] disabled:bg-gray-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isTyping || remaining <= 0}
              className="p-2 text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-50 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#378ADD] text-white rounded-full shadow-lg hover:bg-[#2d6fc0] transition-all flex items-center justify-center hover:scale-105"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
