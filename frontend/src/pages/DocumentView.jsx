import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import Layout from '../components/Layout'
import Summary from '../components/Summary'
import Flashcards from '../components/Flashcards'
import QuizView from '../components/QuizView'
import FloatingChat from '../components/FloatingChat'
import { listDocuments, getFileUrl } from '../api'

const TABS = [
  { id: 'summary', label: 'สรุป' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
]

export default function DocumentView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('summary')
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fileUrl, setFileUrl] = useState(null)
  const [quizActive, setQuizActive] = useState(false)
  const mountedTabs = useRef(new Set(['summary']))

  useEffect(() => {
    async function fetchDoc() {
      try {
        const docs = await listDocuments()
        const found = docs.find((d) => d.documentId === id)
        setDoc(found || null)
      } catch (err) {
        console.error('Failed to fetch document:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [id])

  // Fetch presigned file URL for PDF viewer
  useEffect(() => {
    if (!doc || doc.status !== 'ready') return
    async function fetchFile() {
      try {
        const data = await getFileUrl(id)
        setFileUrl(data.fileUrl)
      } catch (err) {
        console.error('Failed to get file URL:', err)
      }
    }
    fetchFile()
  }, [id, doc])

  useEffect(() => {
    mountedTabs.current.add(activeTab)
  }, [activeTab])

  function handleBack() {
    if (doc?.subjectId) {
      navigate(`/subjects/${doc.subjectId}`)
    } else {
      navigate('/dashboard')
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-[#378ADD] border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  if (!doc) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <p className="text-gray-500 text-sm">ไม่พบเอกสาร</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-sm text-[#378ADD] hover:underline">
            กลับหน้าหลัก
          </button>
        </div>
      </Layout>
    )
  }

  const isPdf = doc.fileType === 'pdf'

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-semibold text-gray-900 truncate" title={doc.fileName}>
            {doc.fileName}
            {doc.topic && <span className="text-gray-400 font-normal"> / {doc.topic}</span>}
          </h1>
        </div>

        {/* Quiz mode: full width, no PDF, no tabs */}
        {quizActive ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 overflow-y-auto" style={{ minHeight: 'calc(100vh - 160px)' }}>
            <QuizView documentId={id} onQuizStateChange={setQuizActive} />
          </div>
        ) : (
          /* Normal mode: Two-column layout */
          <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 160px)' }}>
            {/* Left: Original file viewer */}
            <div className="w-1/2 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                <FileText size={14} className="text-gray-500" />
                <span className="text-xs font-medium text-gray-600 truncate">{doc.fileName}</span>
              </div>
              <div className="flex-1">
                {fileUrl && isPdf ? (
                  <iframe src={fileUrl} className="w-full h-full border-0" title="Document viewer" />
                ) : fileUrl && !isPdf ? (
                  <div className="flex items-center justify-center h-full p-4">
                    <img src={fileUrl} alt={doc.fileName} className="max-w-full max-h-full object-contain rounded" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">กำลังโหลดไฟล์...</div>
                )}
              </div>
            </div>

            {/* Right: Summary / Flashcards / Quiz */}
            <div className="w-1/2 flex flex-col">
              <div className="border-b border-gray-200 mb-4">
                <div className="flex gap-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                        ${activeTab === tab.id
                          ? 'border-[#378ADD] text-[#378ADD]'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 overflow-y-auto">
                <div className={activeTab === 'summary' ? '' : 'hidden'}>
                  <Summary documentId={id} />
                </div>
                <div className={activeTab === 'flashcards' ? '' : 'hidden'}>
                  {mountedTabs.current.has('flashcards') && <Flashcards documentId={id} />}
                </div>
                <div className={activeTab === 'quiz' ? '' : 'hidden'}>
                  {mountedTabs.current.has('quiz') && <QuizView documentId={id} onQuizStateChange={setQuizActive} />}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating chat — hidden during active quiz */}
      {!quizActive && <FloatingChat documentId={id} />}
    </Layout>
  )
}
