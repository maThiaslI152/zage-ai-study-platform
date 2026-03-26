import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { useAuth } from '../App'

export default function Signup() {
  const { signup, confirmOtp, login } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('signup') // 'signup' | 'confirm'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignup(e) {
    e.preventDefault()
    if (!email || !password || !confirm) {
      setError('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (password !== confirm) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }
    setError('')
    setLoading(true)

    try {
      const result = await signup(email, password)
      if (result.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        setStep('confirm')
      }
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('UsernameExistsException') || msg.includes('already exists')) {
        setError('อีเมลนี้ถูกใช้แล้ว')
      } else if (msg.includes('InvalidPasswordException') || msg.includes('password')) {
        setError('รหัสผ่านไม่ตรงตามเงื่อนไข')
      } else {
        setError(msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    if (!otpCode) {
      setError('กรุณากรอกรหัสยืนยัน')
      return
    }
    setError('')
    setLoading(true)

    try {
      await confirmOtp(email, otpCode)
      // Auto-login after confirmation
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('CodeMismatchException') || msg.includes('code')) {
        setError('รหัสยืนยันไม่ถูกต้อง')
      } else if (msg.includes('ExpiredCodeException') || msg.includes('expired')) {
        setError('รหัสยืนยันหมดอายุ กรุณาสมัครใหม่')
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
          <p className="text-sm text-gray-500">
            {step === 'signup' ? 'สร้างบัญชีใหม่' : 'ยืนยันอีเมล'}
          </p>
        </div>

        {step === 'signup' ? (
          <form onSubmit={handleSignup} className="space-y-4">
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
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ยืนยันรหัสผ่าน</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#378ADD]"
                autoComplete="new-password"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              เราส่งรหัสยืนยันไปที่ <span className="font-medium text-gray-900">{email}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสยืนยัน</label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:border-[#378ADD]"
                autoComplete="one-time-code"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          มีบัญชีแล้ว?{' '}
          <Link to="/login" className="text-[#378ADD] font-medium hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  )
}
