import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { useAuth } from '../App'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน')
      return
    }
    setError('')
    setLoading(true)

    try {
      const result = await login(email, password)
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        setError('กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('NotAuthorizedException') || msg.includes('Incorrect')) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      } else if (msg.includes('UserNotFoundException') || msg.includes('not found')) {
        setError('ไม่พบบัญชีนี้ กรุณาสมัครสมาชิก')
      } else if (msg.includes('UserNotConfirmedException')) {
        setError('กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ')
      } else {
        setError(msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-xl p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={28} className="text-[#378ADD]" />
            <span className="text-2xl font-bold text-gray-900">Zage</span>
          </div>
          <p className="text-sm text-gray-500">AI Study Assistant</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#378ADD]"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#378ADD]"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-60 transition-colors"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ยังไม่มีบัญชี?{' '}
          <Link to="/signup" className="text-[#378ADD] font-medium hover:underline">
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </div>
  )
}
