import { fetchAuthSession } from 'aws-amplify/auth'

const BASE_URL = import.meta.env.VITE_API_URL

// Model provider state — persisted in localStorage
const MODEL_KEY = 'zage_model_provider'
export const MODEL_OPTIONS = [
  { id: 'local', label: 'LM Studio (Local)', desc: 'localhost:1234' },
  { id: 'openrouter', label: 'MiniMax M2.5', desc: 'ฟรี, ภาษาไทยดี' },
  { id: 'openrouter-qwen', label: 'Qwen3 80B', desc: 'ฟรี, คุณภาพสูง' },
  { id: 'openrouter-llama', label: 'Llama 3.3 70B', desc: 'ฟรี, Meta' },
  { id: 'openrouter-mistral', label: 'Mistral Small 3.1', desc: 'ฟรี, เร็ว' },
  { id: 'openrouter-gemma27', label: 'Gemma 3 27B', desc: 'ฟรี, Google' },
  { id: 'openrouter-gemma12', label: 'Gemma 3 12B', desc: 'ฟรี, เบา' },
  { id: 'openrouter-nemotron', label: 'Nemotron 3 Super', desc: 'ฟรี, NVIDIA' },
  { id: 'openrouter-gpt120', label: 'GPT-OSS 120B', desc: 'ฟรี, OpenAI' },
  { id: 'openrouter-gpt20', label: 'GPT-OSS 20B', desc: 'ฟรี, เร็ว' },
  { id: 'claude', label: 'Claude Haiku (Bedrock)', desc: 'AWS native' },
  { id: 'nova', label: 'Nova Micro (Bedrock)', desc: 'AWS native' },
]

export function getModelProvider() {
  return localStorage.getItem(MODEL_KEY) || 'local'
}

export function setModelProvider(provider) {
  localStorage.setItem(MODEL_KEY, provider)
}

async function getHeaders() {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString() || ''
  return {
    'Content-Type': 'application/json',
    Authorization: token,
    'X-Model-Provider': getModelProvider(),
  }
}

async function request(method, path, body = null) {
  const headers = await getHeaders()
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, opts)
  const data = await res.json()

  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`
    const err = new Error(msg)
    err.code = data?.code || 'UNKNOWN'
    err.status = res.status
    throw err
  }
  return data
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function listDocuments() {
  const data = await request('GET', '/documents')
  return data.documents
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export async function listSubjects() {
  const data = await request('GET', '/subjects')
  return data.subjects
}

export async function createSubject(name) {
  const data = await request('POST', '/subjects', { name })
  return data.subject
}

export async function deleteSubject(subjectId) {
  return request('DELETE', `/subjects/${subjectId}`)
}

export async function getUploadUrl(fileName, fileType, subjectId = '') {
  return request('POST', '/upload/url', { fileName, fileType, subjectId })
}

export async function uploadFileToS3(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('File upload failed')
}

export async function processDocument(documentId) {
  return request('POST', `/documents/${documentId}/process`)
}

export async function checkDocumentStatus(documentId) {
  return request('GET', `/documents/${documentId}/status`)
}

export async function deleteDocument(documentId) {
  return request('DELETE', `/documents/${documentId}`)
}

export async function getFileUrl(documentId) {
  return request('GET', `/documents/${documentId}/file`)
}

// ─── AI Features ────────────────────────────────────────────────────────────

export async function summarizeDocument(documentId, regenerate = false) {
  return request('POST', `/documents/${documentId}/summarize`, { regenerate })
}

export async function chatWithDocument(documentId, message) {
  return request('POST', `/documents/${documentId}/chat`, { message })
}

export async function generateFlashcards(documentId, regenerate = false) {
  return request('POST', `/documents/${documentId}/flashcards`, { regenerate })
}

// ─── Quiz ───────────────────────────────────────────────────────────────────

export async function generateQuiz(documentId, customPrompt = '') {
  return request('POST', `/documents/${documentId}/quiz`, { customPrompt })
}

export async function listQuizzes(documentId) {
  const data = await request('GET', `/documents/${documentId}/quiz`)
  return data.quizzes
}

export async function getQuiz(documentId, quizId) {
  return request('GET', `/documents/${documentId}/quiz/${quizId}`)
}

export async function submitQuiz(documentId, quizId, answers) {
  return request('POST', `/documents/${documentId}/quiz/${quizId}/submit`, { answers })
}

// ─── Debug ──────────────────────────────────────────────────────────────────

export async function resetQuota() {
  return request('POST', '/debug/reset-quota')
}
