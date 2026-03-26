# Zage — AI Study Platform
## SPU x AWS Hackathon Presentation

> "อัปโหลดสไลด์ → AI สรุปให้ → ฝึกทำ Quiz → ถาม AI ได้เลย"

---

## 🎯 ปัญหาที่แก้

นักศึกษาไทยเจอปัญหาเหล่านี้ทุกวัน:
- ไฟล์ PDF สไลด์กระจัดกระจาย อ่านไม่ทัน
- ไม่กล้าถามอาจารย์ในห้องเรียน
- ไม่มีแบบฝึกหัดให้ทำก่อนสอบ
- อ่านสไลด์แล้วไม่เข้าใจ context

---

## ✨ ฟีเจอร์

### 1. จัดการวิชา (Subjects)
- สร้างวิชา จัดกลุ่มเอกสารตามรายวิชา
- อัปโหลด PDF/รูปภาพ ลากวางได้

### 2. AI สรุปอัตโนมัติ (Auto Summary)
- อัปโหลดเสร็จ → AI สรุปให้ทันที
- สรุปเนื้อหา + Key Points
- ตั้งชื่อหัวข้อให้อัตโนมัติ
- Regenerate ได้ถ้าไม่พอใจ

### 3. Split View — อ่านคู่กัน
- ซ้าย: ไฟล์ต้นฉบับ (PDF viewer / รูปภาพ)
- ขวา: สรุป / Flashcard / Quiz

### 4. AI Chatbot (Floating)
- ถามเกี่ยวกับเอกสารได้ตลอด ไม่ต้องสลับ tab
- ตอบจากเนื้อหาจริงในเอกสาร ไม่แต่งเอง
- รองรับ Markdown (ตาราง, bold, list)
- จำกัด 20 ข้อความ/เอกสาร (ควบคุมต้นทุน)

### 5. Flashcards
- AI สร้าง 10-15 การ์ดจากเนื้อหา
- พลิกการ์ดดูคำตอบ, เลื่อนซ้าย-ขวา
- Regenerate ได้

### 6. Quiz แบบ Gamify
- 10 ข้อปรนัย, ครอบคลุมเนื้อหากว้าง
- ปรับแต่งได้: "อยากได้ข้อสอบยากขึ้น", "เน้นเรื่อง X"
- สลับข้อ + สลับตัวเลือกทุกครั้ง (ป้องกันจำคำตอบ)
- Auto-forward toggle, เปลี่ยนคำตอบได้
- จับเวลา, แสดงคะแนนแบบ Score Ring
- AI แนะนำหลังทำเสร็จ: ควรทบทวนเรื่องอะไร
- ซ่อนเนื้อหาทั้งหมดระหว่างทำ Quiz (โหมดสอบ)
- บันทึกคะแนนทุกครั้ง (Quiz #1, #2, ...)

### 7. Hot-Swap AI Model
- เปลี่ยน AI model ได้ทันทีจาก navbar
- รองรับ: Claude Haiku (Bedrock), Nova Micro (Bedrock), + OpenRouter models

### 8. Rate Limiting & Cost Control
- 50 AI calls/วัน/ผู้ใช้
- 20 chat messages/เอกสาร
- Custom prompt จำกัด 200 ตัวอักษร
- Caching: สรุป, flashcard, quiz ไม่สร้างซ้ำ

---

## 🏗️ AWS Architecture (100% Serverless)

```
User (Browser)
    │
    ▼
S3 Static Website ← React SPA (Vite + Tailwind)
    │
    ▼
API Gateway (REST + Cognito Authorizer + CORS + Rate Limit)
    │
    ├── POST /subjects, GET /subjects, DELETE /subjects/{id}
    ├── POST /upload/url → Lambda → S3 Presigned URL
    ├── POST /documents/{id}/process → Lambda → PyPDF2 / Textract
    ├── GET  /documents/{id}/status → Lambda → Poll Textract
    ├── POST /documents/{id}/summarize → Lambda → Bedrock/OpenRouter
    ├── POST /documents/{id}/chat → Lambda → Bedrock/OpenRouter
    ├── POST /documents/{id}/flashcards → Lambda → Bedrock/OpenRouter
    ├── POST /documents/{id}/quiz → Lambda → Bedrock/OpenRouter
    ├── GET  /documents/{id}/quiz/{qid} → Lambda → DynamoDB
    ├── POST /documents/{id}/quiz/{qid}/submit → Lambda → Grade + AI suggestion
    ├── DELETE /documents/{id} → Lambda → Cleanup all related data
    ├── GET  /documents/{id}/file → Lambda → S3 Presigned GET URL
    ├── GET  /documents → Lambda → List user documents
    └── POST /debug/reset-quota → Lambda → Reset rate limit
```

### AWS Services ที่ใช้

| Service | ทำหน้าที่อะไร |
|---|---|
| **S3** (2 buckets) | 1) เก็บไฟล์ที่อัปโหลด 2) Host เว็บ React |
| **Cognito** | สมัคร/เข้าสู่ระบบ, JWT token, OTP ยืนยันอีเมล |
| **API Gateway** | REST API, Cognito authorizer, CORS, rate limiting |
| **Lambda** (12 functions) | Backend logic ทั้งหมด (Python 3.12) |
| **DynamoDB** (5 tables) | documents, subjects, chats, flashcards, quizzes |
| **Textract** | OCR สำหรับไฟล์ภาพ/PDF สแกน |
| **Bedrock** | Claude Haiku / Nova Micro สำหรับ AI features |
| **CloudFormation (SAM)** | Infrastructure as Code — deploy ทุกอย่างด้วยคำสั่งเดียว |

### Document Processing Pipeline

```
PDF อัปโหลด
    │
    ▼
① PyPDF2 (ฟรี, เร็ว) ── สำเร็จ? ──→ extractedText → DynamoDB (ready)
    │                                        │
    ✗ ล้มเหลว                               ▼
    │                              Auto-generate:
    ▼                              ├── Summary
② Textract (async)                 ├── Flashcards
    │                              └── Quiz #1
    ▼
Poll ทุก 3 วินาที → ready → Auto-generate
```

### Token Optimization

| มาตรการ | ประหยัดได้ |
|---|---|
| Summary cached ใน DynamoDB | ไม่สร้างซ้ำ |
| Flashcard cached | ไม่สร้างซ้ำ |
| Quiz cached | ไม่สร้างซ้ำ |
| Chat ใช้ summary เป็น context แทน raw text | ลด input 60% |
| Chat history จำกัด 6 messages + 3000 chars | ลด input 40% |
| max_tokens ปรับตามงาน (800-2000) | ลด output waste |
| Rate limit 50/วัน + 20 chat/เอกสาร | ป้องกัน abuse |
| PyPDF2 ก่อน Textract | ลดค่า OCR 70% |

---

## 💰 Pricing & Business Model (100 ผู้ใช้, 1 USD ≈ 34 THB)

### 📊 ข้อมูลจริงจากการทดสอบ (Real Usage Data)

จากการทดสอบจริง 1 ผู้ใช้ × 3 เอกสาร:

| รายการ | ค่าจริง |
|---|---|
| API calls ทั้งหมด | 25 ครั้ง (20 สำเร็จ, 5 ยกเลิก) |
| Input tokens รวม | 237,898 tokens |
| Output tokens รวม | 33,233 tokens |
| เฉลี่ยต่อ call | ~12,000 input + ~1,700 output |
| Calls ต่อเอกสาร | ~7 ครั้ง (summary + flashcard + quiz + chat) |

**ถ้าใช้ Bedrock จริง session นี้จะเสีย:**
- Claude Haiku: ฿11 (ทั้ง session)
- Nova Micro: ฿0.44 (ทั้ง session)

### ต้นทุน AWS พื้นฐาน (ทุก plan ใช้ร่วมกัน)

| บริการ | ต้นทุน/เดือน |
|---|---|
| S3 (hosting + uploads) | ฿5 |
| Cognito (100 MAU, free tier) | ฿0 |
| API Gateway (~80,000 requests) | ฿7 |
| Lambda (~80,000 invocations) | ฿15 |
| DynamoDB (on-demand) | ฿15 |
| Textract (เฉพาะภาพ, ~3,000 หน้า) | ฿150 |
| **รวม AWS พื้นฐาน** | **฿192/เดือน** |

### ต้นทุน AI ต่อ plan (จากข้อมูลจริง: ~67 calls/คน/เดือน)

#### Free Plan — ใช้ Nova Micro (Bedrock) แบบจำกัด
| รายการ | Quota | AI Model | ต้นทุน/60 คน |
|---|---|---|---|
| วิชา | 2 วิชา | - | - |
| เอกสาร | 5 ไฟล์ | - | - |
| สรุป + Flashcard + Quiz | 5 ชุด | Nova Micro | ฿3 |
| Chat | 10 ข้อความ/เอกสาร | Nova Micro | ฿1 |
| **ต้นทุน AI** | | | **฿4** |

#### Standard Plan — Hybrid (Haiku สรุป/Quiz + Nova Micro Chat)
| รายการ | Quota | ต้นทุน/คน/เดือน | 30 คน |
|---|---|---|---|
| เอกสาร | 20 ไฟล์ | - | - |
| สรุป + Flashcard + Quiz (Haiku) | 20 ชุด | ฿11 | ฿330 |
| Chat (Nova Micro) | 20 msg/เอกสาร | ฿0.50 | ฿15 |
| Quiz suggestion (Nova) | 10 ครั้ง | ฿0.05 | ฿2 |
| **ต้นทุน AI** | | **฿16/คน** | **฿480** |

#### Premium Plan — Claude Haiku ทุกฟีเจอร์ (Bedrock native)
| รายการ | Quota | ต้นทุน/คน/เดือน | 10 คน |
|---|---|---|---|
| เอกสาร | ไม่จำกัด | - | - |
| สรุป + Flashcard + Quiz (Haiku) | ไม่จำกัด | ฿22 | ฿220 |
| Chat (Haiku) | 50 msg/เอกสาร | ฿11 | ฿110 |
| Quiz suggestion (Haiku) | ไม่จำกัด | ฿4 | ฿40 |
| **ต้นทุน AI** | | **฿37/คน** | **฿370** |

### สรุปต้นทุนรวม (100 ผู้ใช้: 60 Free + 30 Standard + 10 Premium)

| รายการ | ฿/เดือน |
|---|---|
| AWS พื้นฐาน | ฿192 |
| AI — Free (60 คน × ฿0.07) | ฿4 |
| AI — Standard (30 คน × ฿16) | ฿480 |
| AI — Premium (10 คน × ฿37) | ฿370 |
| **ต้นทุนรวม** | **฿1,046** |

### ราคาขาย & กำไร

| Plan | ราคา/เดือน | จำนวน | รายได้ |
|---|---|---|---|
| Free | ฿0 | 60 คน | ฿0 |
| Standard | ฿79 | 30 คน | ฿2,370 |
| Premium | ฿179 | 10 คน | ฿1,790 |
| **รายได้รวม** | | | **฿4,160** |

| | ฿/เดือน |
|---|---|
| รายได้ | ฿4,160 |
| ต้นทุน | -฿1,046 |
| **กำไร** | **฿3,114** |
| **Gross Margin** | **75%** |
| **Break-even** | **~13 paying users** |

### Quota ต่อ Plan

| | Free | Standard | Premium |
|---|---|---|---|
| วิชา | 2 | ไม่จำกัด | ไม่จำกัด |
| เอกสาร/วิชา | 5 | 20 | ไม่จำกัด |
| AI calls/วัน | 10 | 50 | 200 |
| Chat/เอกสาร | 10 | 20 | 50 |
| Quiz/เอกสาร | 3 | 10 | ไม่จำกัด |
| AI Model | Nova Micro (จำกัด) | Hybrid (Haiku+Nova) | Claude Haiku ทั้งหมด |
| Custom quiz prompt | ✗ | ✓ | ✓ |
| AI study suggestion | ✗ | ✓ | ✓ |

---

## 🔗 Live Demo

- **เว็บ:** http://zage-frontend-957503053163.s3-website-ap-southeast-1.amazonaws.com
- **API:** https://88le3v71h4.execute-api.ap-southeast-1.amazonaws.com/prod
- **Region:** ap-southeast-1 (Singapore)
- **Stack:** zage-stack (CloudFormation)

---

## 👥 Team

SPU x AWS Hackathon — Team G
