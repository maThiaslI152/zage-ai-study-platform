import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, BookOpen, FileText, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { listSubjects, createSubject, deleteSubject } from '../api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create subject modal
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchSubjects = useCallback(async () => {
    try {
      const data = await listSubjects()
      setSubjects(data)
    } catch (err) {
      setError('ไม่สามารถโหลดรายวิชาได้')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubjects()
  }, [fetchSubjects])

  async function handleCreate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const subject = await createSubject(name)
      setSubjects((prev) => [{ ...subject, documentCount: 0 }, ...prev])
      setNewName('')
      setShowCreate(false)
    } catch (err) {
      console.error('Create subject error:', err)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(subjectId, e) {
    e.stopPropagation()
    if (!confirm('ลบวิชานี้?')) return
    try {
      await deleteSubject(subjectId)
      setSubjects((prev) => prev.filter((s) => s.subjectId !== subjectId))
    } catch (err) {
      console.error('Delete subject error:', err)
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">วิชาของฉัน</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] transition-colors"
          >
            <Plus size={16} />
            สร้างวิชาใหม่
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">สร้างวิชาใหม่</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ชื่อวิชา เช่น แคลคูลัส 1"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#378ADD]"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); setNewName('') }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={!newName.trim() || creating}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#378ADD] rounded-lg hover:bg-[#2d6fc0] disabled:opacity-60 transition-colors"
                  >
                    {creating && <Loader2 size={14} className="animate-spin" />}
                    สร้าง
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Subject grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-[#378ADD] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 text-center py-16">{error}</p>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">ยังไม่มีวิชา — สร้างวิชาแรกของคุณ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((subj) => (
              <div
                key={subj.subjectId}
                onClick={() => navigate(`/subjects/${subj.subjectId}`)}
                className="border border-gray-200 rounded-xl bg-white p-5 cursor-pointer hover:border-[#378ADD] hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <BookOpen size={20} className="text-[#378ADD]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{subj.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <FileText size={11} />
                        {subj.documentCount || 0} เอกสาร
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(subj.subjectId, e)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    title="ลบวิชา"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
