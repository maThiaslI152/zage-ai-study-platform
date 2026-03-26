# 📚 Zage — AI Study Platform

> อัปโหลดสไลด์ → AI สรุปให้ → ฝึกทำ Quiz → ถาม AI ได้เลย

Zage ช่วยนักศึกษาเรียนรู้เร็วขึ้นด้วย AI — อัปโหลด PDF หรือรูปภาพ แล้ว AI จะสรุป สร้าง Flashcard สร้าง Quiz และตอบคำถามให้อัตโนมัติ

**Live Demo:** http://zage-frontend-957503053163.s3-website-ap-southeast-1.amazonaws.com

---

## ✨ Features

- **Subject Management** — จัดกลุ่มเอกสารตามรายวิชา
- **Auto Summary** — อัปโหลดเสร็จ AI สรุป + ตั้งชื่อหัวข้อให้ทันที
- **Split View** — อ่านไฟล์ต้นฉบับคู่กับสรุป
- **Floating Chatbot** — ถามเกี่ยวกับเอกสารได้ตลอด ไม่ต้องสลับ tab รองรับ Markdown
- **Flashcards** — AI สร้างการ์ดจากเนื้อหา พลิกดูคำตอบ
- **Gamified Quiz** — 10 ข้อปรนัย, ปรับแต่งได้, สลับข้อ+ตัวเลือก, จับเวลา, AI แนะนำหลังทำเสร็จ
- **Hot-Swap AI** — เปลี่ยน model ได้ทันที (Bedrock + OpenRouter)
- **Cost Controls** — Rate limiting, caching, per-document chat limits

---

## 🏗️ Architecture

100% Serverless on AWS (ap-southeast-1)

```
React SPA (S3) → API Gateway → Lambda (Python 3.12) → DynamoDB / S3 / Textract / Bedrock
                      ↑
                  Cognito Auth
```

| AWS Service | Purpose |
|---|---|
| S3 | Frontend hosting + file uploads |
| Cognito | Authentication (email + OTP) |
| API Gateway | REST API + rate limiting |
| Lambda (12 functions) | All backend logic |
| DynamoDB (5 tables) | documents, subjects, chats, flashcards, quizzes |
| Textract | OCR for scanned PDFs/images |
| Bedrock | AI (Claude Haiku / Nova Micro) |
| SAM/CloudFormation | Infrastructure as Code |

---

## 📁 Project Structure

```
├── backend/
│   ├── template.yaml              # SAM template (all infrastructure)
│   └── functions/
│       ├── shared/                 # Shared modules (auth, bedrock, dynamo)
│       ├── subjects/               # CRUD subjects
│       ├── upload_url/             # Presigned S3 URL
│       ├── process_document/       # PyPDF2 + Textract
│       ├── check_status/           # Poll Textract status
│       ├── summarize/              # AI summary
│       ├── chat/                   # AI chatbot
│       ├── flashcards/             # AI flashcard generation
│       ├── quiz/                   # AI quiz generation + grading
│       ├── get_file_url/           # Presigned GET URL for viewer
│       ├── delete_document/        # Delete doc + related data
│       ├── list_documents/         # List user documents
│       └── reset_quota/            # Debug: reset rate limit
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Auth context + routing
│   │   ├── api.js                  # API client + model selector
│   │   ├── components/             # UI components
│   │   └── pages/                  # Page views
│   └── package.json
├── scripts/
│   ├── deploy.sh                   # Full deploy script
│   └── seed-data.sh                # Test data
└── HACKATHON_PRESENTATION.md       # Presentation with pricing
```

---

## 🚀 Deploy

### Prerequisites

- AWS CLI configured (`aws configure`)
- SAM CLI (`brew install aws-sam-cli`)
- Python 3.12 (`brew install python@3.12`)
- Node.js 18+ (`node --version`)
- Bedrock model access enabled in AWS Console

### Backend

```bash
cd backend
PATH="/opt/homebrew/opt/python@3.12/libexec/bin:$PATH" sam build --parallel
sam deploy --guided
```

### Frontend

```bash
cd frontend
cp .env.example .env.local  # Fill in values from SAM outputs
npm install
npm run build
aws s3 sync dist/ s3://YOUR_FRONTEND_BUCKET --delete
```

Or use the all-in-one script:

```bash
./scripts/deploy.sh
```

---

## ⚙️ Environment Variables

### Frontend (.env.local)

```
VITE_API_URL=https://xxx.execute-api.ap-southeast-1.amazonaws.com/prod
VITE_USER_POOL_ID=ap-southeast-1_xxxxx
VITE_USER_POOL_CLIENT_ID=xxxxx
VITE_UPLOAD_BUCKET=zage-uploads-xxxxx
VITE_REGION=ap-southeast-1
```

### Backend (set in SAM template)

```
DOCUMENTS_TABLE, CHATS_TABLE, FLASHCARDS_TABLE, SUBJECTS_TABLE, QUIZZES_TABLE
UPLOAD_BUCKET, BEDROCK_REGION, BEDROCK_MODEL_ID, OPENROUTER_API_KEY
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Auth | AWS Cognito + Amplify v6 |
| API | API Gateway REST + Cognito Authorizer |
| Backend | Lambda (Python 3.12) |
| Database | DynamoDB (5 tables, on-demand) |
| File Processing | PyPDF2 (digital PDF) + Textract (OCR) |
| AI | Bedrock (Claude/Nova) + OpenRouter (fallback) |
| IaC | AWS SAM |
| Icons | Lucide React |
| Markdown | react-markdown |

---

## 📄 License

Built for SPU x AWS Hackathon 2026
