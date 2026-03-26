import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Image, Loader2, AlertCircle, Trash2 } from 'lucide-react'

function StatusBadge({ status }) {
  const map = {
    uploading: { label: 'กำลังอัปโหลด', bg: 'bg-gray-100', text: 'text-gray-600', spin: true },
    processing: { label: 'กำลังประมวลผล', bg: 'bg-yellow-100', text: 'text-yellow-700', spin: true },
    ready: { label: 'พร้อมใช้งาน', bg: 'bg-green-100', text: 'text-green-700', spin: false },
    error: { label: 'เกิดข้อผิดพลาด', bg: 'bg-red-100', text: 'text-red-600', spin: false },
  }
  const cfg = map[status] ?? map.error
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {cfg.spin && <Loader2 size={11} className="animate-spin" />}
      {cfg.label}
    </span>
  )
}

function DocCard({ doc, onClick, onDelete }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const isClickable = doc.status === 'ready'
  const isError = doc.status === 'error'
  const Icon = doc.fileType === 'image' ? Image : FileText

  const date = new Date(doc.createdAt).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="relative group">
      <div
        onClick={isError ? () => setShowTooltip((v) => !v) : isClickable ? onClick : undefined}
        className={`border border-gray-200 rounded-xl bg-white px-4 py-3 flex items-center gap-4 transition-all
          ${isClickable ? 'cursor-pointer hover:border-[#378ADD] hover:shadow-sm' : ''}
          ${isError ? 'cursor-pointer opacity-80' : ''}`}
      >
        <div className={`p-2 rounded-lg flex-shrink-0 ${doc.fileType === 'image' ? 'bg-purple-50' : 'bg-blue-50'}`}>
          <Icon size={20} className={doc.fileType === 'image' ? 'text-purple-500' : 'text-[#378ADD]'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900" title={doc.fileName}>
            {doc.fileName}
            {doc.topic && <span className="text-[#378ADD] font-normal"> / {doc.topic}</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{date}</p>
        </div>
        <StatusBadge status={doc.status} />
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(doc.documentId) }}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
            title="ลบเอกสาร"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {isError && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 w-52 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 text-center shadow-lg">
          <AlertCircle size={12} className="inline mr-1 text-red-400" />
          เกิดข้อผิดพลาด กรุณาลองอัปโหลดใหม่
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  )
}

export default function DocumentList({ documents, onDelete }) {
  const navigate = useNavigate()

  if (documents.length === 0) {
    return (
      <p className="text-gray-400 text-sm text-center py-10">
        ยังไม่มีเอกสาร — อัปโหลดไฟล์แรกของคุณด้านบน
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocCard
          key={doc.documentId}
          doc={doc}
          onClick={() => navigate(`/documents/${doc.documentId}`)}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
