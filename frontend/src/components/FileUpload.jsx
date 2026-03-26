import React, { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

export default function FileUpload({ onUpload }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files) {
    const accepted = Array.from(files).filter((f) =>
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    )
    accepted.forEach((file) => onUpload(file))
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleChange(e) {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-colors select-none
        ${dragging
          ? 'border-[#378ADD] bg-blue-50'
          : 'border-gray-300 bg-white hover:border-[#378ADD] hover:bg-blue-50'
        }`}
    >
      <UploadCloud
        size={40}
        className={dragging ? 'text-[#378ADD]' : 'text-gray-400'}
      />
      <p className="text-gray-600 text-sm text-center">
        <span className="font-semibold text-[#378ADD]">คลิกเพื่อเลือกไฟล์</span>{' '}
        หรือลากวางที่นี่
      </p>
      <p className="text-xs text-gray-400">รองรับ PDF, JPEG, PNG</p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
