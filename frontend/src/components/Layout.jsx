import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, LogOut, Cpu, RotateCcw } from 'lucide-react'
import { useAuth } from '../App'
import { MODEL_OPTIONS, getModelProvider, setModelProvider, resetQuota } from '../api'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState(getModelProvider())
  const [resetting, setResetting] = useState(false)
  const dropdownRef = useRef(null)
  const modelRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (modelRef.current && !modelRef.current.contains(e.target)) setModelOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() { logout(); navigate('/login') }
  function handleModelChange(id) { setModelProvider(id); setCurrentModel(id); setModelOpen(false) }

  async function handleResetQuota() {
    setResetting(true)
    try {
      await resetQuota()
      alert('โควต้า AI ถูกรีเซ็ตแล้ว')
    } catch (err) {
      alert('รีเซ็ตไม่สำเร็จ: ' + (err.message || 'error'))
    } finally {
      setResetting(false)
    }
  }

  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'ZG'
  const activeModel = MODEL_OPTIONS.find((m) => m.id === currentModel) || MODEL_OPTIONS[0]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-gray-200 flex items-center px-6">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 font-bold text-lg text-gray-900 hover:text-[#378ADD] transition-colors">
          <BookOpen size={22} className="text-[#378ADD]" />
          Zage
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* Reset quota */}
          <button onClick={handleResetQuota} disabled={resetting} title="รีเซ็ตโควต้า AI"
            className="p-2 text-gray-400 hover:text-[#378ADD] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
            <RotateCcw size={14} className={resetting ? 'animate-spin' : ''} />
          </button>
          {/* Model selector */}
          <div className="relative" ref={modelRef}>
            <button onClick={() => setModelOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
              <Cpu size={13} />{activeModel.label}
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-9 w-56 bg-white border border-gray-200 rounded-lg shadow-sm py-1 text-sm z-50">
                <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">เลือก AI Model</div>
                {MODEL_OPTIONS.map((m) => (
                  <button key={m.id} onClick={() => handleModelChange(m.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${m.id === currentModel ? 'bg-blue-50' : ''}`}>
                    <p className={`text-sm ${m.id === currentModel ? 'text-[#378ADD] font-medium' : 'text-gray-700'}`}>{m.label}</p>
                    <p className="text-xs text-gray-400">{m.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* User menu */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setDropdownOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-[#378ADD] text-white text-sm font-semibold flex items-center justify-center hover:bg-[#2d6fc0] transition-colors">
              {initials}
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-11 w-52 bg-white border border-gray-200 rounded-lg shadow-sm py-1 text-sm">
                <div className="px-4 py-2 border-b border-gray-100 text-gray-500 truncate">{user?.email}</div>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                  <LogOut size={15} />ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
