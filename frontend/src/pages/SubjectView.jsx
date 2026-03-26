import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Layout from '../components/Layout'
import FileUpload from '../components/FileUpload'
import DocumentList from '../components/DocumentList'
import {
  listSubjects,
  listDocuments,
  getUploadUrl,
  uploadFileToS3,
  processDocument,
  checkDocumentStatus,
  deleteDocument,
  summarizeDocument,
  generateFlashcards,
  generateQuiz,
} from '../api'

const POLL_INTERVAL = 3000

export default function SubjectView() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const [subject, setSubject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const pollTimers = useRef({})

  const fetchData = useCallback(async () => {
    try {
      const [subjects, allDocs] = await Promise.all([
        listSubjects(),
        listDocuments(),
      ])
      const subj = subjects.find((s) => s.subjectId === subjectId)
      setSubject(subj || null)

      const filtered = allDocs.filter((d) => d.subjectId === subjectId)
      setDocuments(filtered)

      // Start polling for processing docs
      filtered.forEach((d) => {
        if (d.status === 'processing') startPolling(d.documentId)
      })
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    fetchData()
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval)
    }
  }, [fetchData])

  function startPolling(documentId) {
    if (pollTimers.current[documentId]) return
    pollTimers.current[documentId] = setInterval(async () => {
      try {
        const result = await checkDocumentStatus(documentId)
        if (result.status === 'ready' || result.status === 'error') {
          clearInterval(pollTimers.current[documentId])
          delete pollTimers.current[documentId]
          setDocuments((prev) =>
            prev.map((d) =>
              d.documentId === documentId ? { ...d, status: result.status } : d
            )
          )
          // Auto-generate summary, flashcards, and 1 quiz set when ready
          if (result.status === 'ready') {
            autoGenerate(documentId)
          }
        }
      } catch (err) {
        console.error(`Poll error for ${documentId}:`, err)
      }
    }, POLL_INTERVAL)
  }

  async function autoGenerate(documentId) {
    try {
      // Fire all 3 in parallel — they're independent
      await Promise.allSettled([
        summarizeDocument(documentId),
        generateFlashcards(documentId),
        generateQuiz(documentId, ''),
      ])
      console.log(`Auto-generated content for ${documentId}`)
    } catch (err) {
      console.error('Auto-generate error (non-critical):', err)
    }
  }

  async function handleDelete(documentId) {
    if (!confirm('ลบเอกสารนี้?')) return
    try {
      await deleteDocument(documentId)
      setDocuments((prev) => prev.filter((d) => d.documentId !== documentId))
    } catch (err) {
      console.error('Delete document error:', err)
    }
  }

  async function handleUpload(file) {
    const tempId = `temp-${Date.now()}`
    const placeholder = {
      documentId: tempId,
      fileName: file.name,
      fileType: file.type.startsWith('image/') ? 'image' : 'pdf',
      status: 'uploading',
      createdAt: new Date().toISOString(),
      hasSummary: false,
      subjectId,
    }
    setDocuments((prev) => [placeholder, ...prev])

    try {
      const { uploadUrl, documentId } = await getUploadUrl(file.name, file.type, subjectId)

      setDocuments((prev) =>
        prev.map((d) =>
          d.documentId === tempId ? { ...d, documentId } : d
        )
      )

      await uploadFileToS3(uploadUrl, file)

      setDocuments((prev) =>
        prev.map((d) =>
          d.documentId === documentId ? { ...d, status: 'processing' } : d
        )
      )

      const result = await processDocument(documentId)

      if (result.status === 'ready') {
        setDocuments((prev) =>
          prev.map((d) =>
            d.documentId === documentId ? { ...d, status: 'ready' } : d
          )
        )
        // PyPDF2 succeeded synchronously — auto-generate
        autoGenerate(documentId)
      } else {
        startPolling(documentId)
      }
    } catch (err) {
      console.error('Upload error:', err)
      setDocuments((prev) =>
        prev.map((d) =>
          d.documentId === tempId || d.status === 'uploading'
            ? { ...d, status: 'error' }
            : d
        )
      )
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

  if (!subject) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <p className="text-gray-500 text-sm">ไม่พบวิชานี้</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 text-sm text-[#378ADD] hover:underline"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{subject.name}</h1>
        </div>

        {/* Document list */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            เอกสารในวิชานี้
          </h2>
          <DocumentList documents={documents} onDelete={handleDelete} />
        </section>

        {/* Upload */}
        <section>
          <FileUpload onUpload={handleUpload} />
        </section>
      </div>
    </Layout>
  )
}
