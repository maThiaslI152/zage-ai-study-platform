# 🛠️ Tech Stack — Zage AI Study Platform

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  React 18 + Vite + TailwindCSS + Lucide Icons                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │  │
│  │  │ Dashboard │ │ Subject  │ │  Quiz    │ │ Floating Chat  │  │  │
│  │  │ (วิชา)   │ │  View    │ │  Player  │ │  (Bottom-Right)│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│         │ HTTPS                                                     │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS CLOUD (ap-southeast-1)                       │
│                                                                     │
│  ┌─────────────┐    ┌──────────────────────────────────────────┐   │
│  │ S3 Bucket   │    │         API Gateway (REST)               │   │
│  │ (Frontend)  │    │  Cognito Authorizer + CORS + Rate Limit  │   │
│  │ Static Web  │    │  15 endpoints                            │   │
│  └─────────────┘    └──────────┬───────────────────────────────┘   │
│                                ▼                                    │
│  ┌─────────────┐    ┌──────────────────────────────────────────┐   │
│  │  Cognito    │    │        Lambda Functions (12)              │   │
│  │  User Pool  │◄──▶│  subjects, upload_url, process_document, │   │
│  │  (Auth+OTP) │    │  check_status, summarize, chat,          │   │
│  └─────────────┘    │  flashcards, quiz, delete_document,      │   │
│                     │  get_file_url, list_documents,           │   │
│                     │  reset_quota                              │   │
│                     └──────────┬───────────────────────────────┘   │
│                                │                                    │
│              ┌─────────────────┼─────────────────┐                 │
│              ▼                 ▼                  ▼                 │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐         │
│  │  DynamoDB      │ │  S3 Bucket   │ │  AI Models       │         │
│  │  (5 tables)    │ │  (Uploads)   │ │                   │         │
│  │  documents     │ │  /uploads/   │ │  Bedrock:         │         │
│  │  subjects      │ │              │ │  ├ Claude Haiku   │         │
│  │  chats         │ │  PyPDF2 +    │ │  └ Nova Micro     │         │
│  │  flashcards    │ │  Textract    │ │                   │         │
│  │  quizzes       │ │  (OCR)       │ │  OpenRouter:      │         │
│  └────────────────┘ └──────────────┘ │  ├ GPT-OSS 120B   │         │
│                                      │  ├ MiniMax M2.5   │         │
│                                      │  ├ Qwen3 80B      │         │
│                                      │  └ + 6 more free  │         │
│                                      └──────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack Detail

| Layer | Technology | เหตุผลที่เลือก |
|---|---|---|
| **Frontend** | React 18 + Vite | เร็ว, build ไว, deploy บน S3 ได้ |
| **UI** | TailwindCSS + Lucide Icons | สวย, เร็ว, responsive |
| **Language** | JavaScript (JSX) | Frontend dev คุ้นเคย |
| **State** | React Context + useState | เบา, ไม่ต้อง library เพิ่ม |
| **Auth** | AWS Cognito + Amplify v6 | Managed auth, OTP ยืนยันอีเมล |
| **Markdown** | react-markdown | แสดง AI response แบบ rich text |
| **API** | API Gateway (REST) | Serverless, auto-scale, Cognito authorizer |
| **Backend** | Lambda (Python 3.12) | Serverless, รองรับ PyPDF2/Textract |
| **Database** | DynamoDB (5 tables, on-demand) | Serverless, ถูก, scale ได้ |
| **File Storage** | S3 (presigned URL upload) | ถูก, ทนทาน, direct upload จาก browser |
| **CDN** | S3 Static Website | ใช้แทน CloudFront (account restriction) |
| **Doc Parse** | PyPDF2 (digital) + Textract (OCR) | ฟรีสำหรับ digital PDF, Textract เฉพาะภาพ |
| **AI (Production)** | Bedrock (Claude Haiku + Nova Micro) | Managed, pay-per-token, ภาษาไทยดี |
| **AI (Fallback)** | OpenRouter (9 free models) | Hot-swap, ทดสอบได้ฟรี |
| **IaC** | AWS SAM + CloudFormation | Deploy ทุกอย่างเป็น code คำสั่งเดียว |
| **Monitoring** | CloudWatch | Built-in Lambda logs |

---

## 3. DynamoDB Tables

| Table | PK | SK | ข้อมูลหลัก |
|---|---|---|---|
| zage-documents | userId | documentId | fileName, extractedText, summary, topic, status |
| zage-subjects | userId | subjectId | name, createdAt |
| zage-chats | documentId | timestamp | role, content, userId |
| zage-flashcards | documentId | cardId | front, back, userId |
| zage-quizzes | documentId | quizId | questions[], score, quizNumber |

Rate limiting ใช้ zage-documents table กับ SK = `USAGE#YYYY-MM-DD` + TTL auto-delete

---

## 4. API Endpoints (15 routes)

| Method | Path | Lambda | Description |
|---|---|---|---|
| GET | /subjects | subjects | ดูรายวิชาทั้งหมด |
| POST | /subjects | subjects | สร้างวิชาใหม่ |
| DELETE | /subjects/{id} | subjects | ลบวิชา |
| POST | /upload/url | upload_url | ขอ Presigned URL + สร้าง document record |
| POST | /documents/{id}/process | process_document | PyPDF2/Textract → extract text |
| GET | /documents/{id}/status | check_status | Poll สถานะ Textract |
| POST | /documents/{id}/summarize | summarize | AI สรุป + topic + keyPoints |
| POST | /documents/{id}/chat | chat | AI chatbot (context-aware) |
| POST | /documents/{id}/flashcards | flashcards | AI สร้าง flashcards |
| POST | /documents/{id}/quiz | quiz | AI สร้าง quiz 10 ข้อ |
| GET | /documents/{id}/quiz | quiz | ดู quiz ทั้งหมดของเอกสาร |
| GET | /documents/{id}/quiz/{qid} | quiz | ดู quiz เดี่ยว (สำหรับทำซ้ำ) |
| POST | /documents/{id}/quiz/{qid}/submit | quiz | ส่งคำตอบ + AI suggestion |
| DELETE | /documents/{id} | delete_document | ลบเอกสาร + chats + flashcards |
| GET | /documents/{id}/file | get_file_url | Presigned GET URL สำหรับ viewer |
| GET | /documents | list_documents | ดูเอกสารทั้งหมดของ user |
| POST | /debug/reset-quota | reset_quota | รีเซ็ตโควต้า AI (debug) |

---

## 5. Token Optimization

| มาตรการ | ผลลัพธ์ |
|---|---|
| Summary/Flashcard/Quiz cached ใน DynamoDB | ไม่เรียก AI ซ้ำ |
| Chat ใช้ summary เป็น context (ไม่ใช่ raw text) | ลด input tokens 60% |
| Chat history จำกัด 6 messages + 3000 chars | ควบคุม context window |
| max_tokens ปรับตามงาน (800-2000) | ไม่เสีย output เกินจำเป็น |
| Rate limit 50 AI calls/วัน/user | ป้องกัน abuse |
| Chat limit 20 messages/เอกสาร | ควบคุมต้นทุน chat |
| Custom quiz prompt จำกัด 200 chars | ป้องกัน prompt injection |
| PyPDF2 ก่อน Textract | ลดค่า OCR 70% |
| Auto-generate on upload (parallel) | 1 batch = summary+flashcard+quiz พร้อมกัน |

---

## 6. Lambda Configuration

| Lambda | Timeout | Memory | หน้าที่ |
|---|---|---|---|
| subjects | 30s | 256MB | CRUD วิชา |
| upload_url | 30s | 256MB | Presigned URL + DynamoDB |
| process_document | 120s | 256MB | PyPDF2 / Textract async |
| check_status | 15s | 256MB | Poll Textract job |
| summarize | 60s | 256MB | AI summary + topic |
| chat | 60s | 256MB | AI chatbot |
| flashcards | 60s | 256MB | AI flashcard gen |
| quiz | 60s | 256MB | AI quiz gen + grading + suggestion |
| delete_document | 30s | 256MB | Cleanup document + related data |
| get_file_url | 30s | 256MB | Presigned GET URL |
| list_documents | 30s | 256MB | Query user documents |
| reset_quota | 30s | 256MB | Debug: reset rate limit |

---

## 7. Security

| Layer | มาตรการ |
|---|---|
| Auth | Cognito JWT + OTP email verification |
| API | Cognito Authorizer ตรวจ JWT ทุก request |
| CORS | Preflight excluded from auth, specific headers allowed |
| File Upload | Presigned URL (หมดอายุ 5 นาที), MIME type validation |
| Rate Limit | API Gateway throttling (10 req/s) + app-level (50/day) |
| Chat Limit | 20 messages per document |
| Data | DynamoDB encryption at rest, S3 SSE |
| AI | System prompt ป้องกันตอบนอกเนื้อหา |
