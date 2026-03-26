# 🔄 User Flow — Zage AI Study Platform

---

## 1. User Flow Overview

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  สมัคร/   │────▶│  สร้าง   │────▶│  อัปโหลดไฟล์  │────▶│  Auto-gen:   │
│  เข้าสู่   │     │  วิชา    │     │  PDF/IMG      │     │  สรุป+FC+Quiz│
│  ระบบ     │     │          │     │              │     │  (parallel)  │
└──────────┘     └──────────┘     └──────────────┘     └──────┬───────┘
                                                              │
                    ┌─────────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Document View (Split Layout)                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  ซ้าย: PDF Viewer   │  │  ขวา: สรุป | Flashcard | Quiz   │  │
│  │  (ไฟล์ต้นฉบับ)      │  │                                  │  │
│  │                     │  │  + Floating Chat (มุมขวาล่าง)    │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed User Flows

### Flow 1: สมัครสมาชิก & เข้าสู่ระบบ
```
ผู้ใช้                          ระบบ
  │                               │
  │── กรอก email + password ─────▶│
  │                               │── Cognito สร้าง user
  │◄── ส่ง OTP ทาง email ────────│
  │── ยืนยัน OTP (6 หลัก) ──────▶│
  │                               │── Cognito confirm + JWT
  │◄── Auto-login → Dashboard ───│
```

### Flow 2: สร้างวิชา & อัปโหลดเอกสาร
```
ผู้ใช้                          ระบบ
  │                               │
  │── กด "สร้างวิชาใหม่" ───────▶│── บันทึกใน DynamoDB (subjects)
  │── ตั้งชื่อวิชา ─────────────▶│
  │◄── แสดงวิชาใน Dashboard ─────│
  │                               │
  │── เข้าวิชา → ลากไฟล์ PDF ───▶│
  │                               │── POST /upload/url
  │                               │── Presigned URL → S3 direct upload
  │                               │── POST /process
  │                               │   ├─ PyPDF2 (digital PDF) → สำเร็จ? → ready
  │                               │   └─ Textract async (ภาพ/สแกน)
  │◄── แสดง "กำลังประมวลผล" ─────│
  │                               │
  │   (poll /status ทุก 3 วินาที) │── เมื่อ ready:
  │                               │   Auto-generate (parallel):
  │                               │   ├── POST /summarize → AI สรุป + topic
  │                               │   ├── POST /flashcards → AI สร้างการ์ด
  │◄── แสดง "พร้อมใช้งาน" ───────│   └── POST /quiz → AI สร้าง Quiz #1
  │                               │
  │── คลิกเอกสาร ───────────────▶│── Document View (Split Layout)
```

### Flow 3: อ่านสรุป + ถาม Chatbot
```
ผู้ใช้                          ระบบ
  │                               │
  │── เปิดเอกสาร ───────────────▶│── Split View:
  │                               │   ซ้าย: PDF viewer (presigned GET URL)
  │                               │   ขวา: สรุป (cached จาก auto-gen)
  │◄── แสดงสรุป + Key Points ────│
  │                               │
  │── กดปุ่ม Chat (มุมขวาล่าง) ──▶│── เปิด Floating Chat popup
  │── "อธิบายเรื่อง X ให้หน่อย" ─▶│
  │                               │── Lambda: chat
  │                               │   ① ดึง summary + extractedText
  │                               │   ② ดึง chat history (6 ข้อความ)
  │                               │   ③ ส่งไป AI พร้อม system prompt
  │                               │      "ตอบจากเนื้อหาเท่านั้น"
  │◄── AI ตอบ (Markdown) ────────│   ④ บันทึก chat ใน DynamoDB
  │                               │   ⑤ แสดง remaining: 19/20
  │── ถามต่อได้อีก 19 ข้อความ ───│
```

### Flow 4: ทำ Quiz (Gamified)
```
ผู้ใช้                          ระบบ
  │                               │
  │── เปิด tab Quiz ────────────▶│── แสดง Quiz list (Quiz #1 จาก auto-gen)
  │── กด "เริ่มทำ" หรือ          │
  │   "สร้าง Quiz ใหม่" ────────▶│
  │                               │── (ถ้าสร้างใหม่)
  │── ปรับแต่ง: "เน้นเรื่อง X"  │   POST /quiz + customPrompt (max 200 chars)
  │   (ไม่บังคับ, 200 ตัวอักษร) ▶│   AI สร้าง 10 ข้อ (easy/medium/hard)
  │                               │
  │◄── โหมดสอบ: ซ่อนทุกอย่าง ───│── ซ่อน PDF, สรุป, Chat
  │                               │── สลับข้อ + สลับตัวเลือก
  │                               │── จับเวลา
  │── ตอบข้อ 1 (คลิกตัวเลือก) ──▶│
  │   (Auto-forward → ข้อถัดไป)  │── เปลี่ยนคำตอบได้ (คลิกซ้ำ = ยกเลิก)
  │── ตอบครบ 10 ข้อ ────────────▶│
  │── กด "ส่งคำตอบ" ────────────▶│── POST /quiz/{id}/submit
  │                               │   ① ตรวจคำตอบ
  │                               │   ② บันทึกคะแนน
  │                               │   ③ AI สร้างคำแนะนำจากข้อที่ผิด
  │◄── แสดงผล: ──────────────────│
  │   Score Ring (เช่น 70%)      │
  │   🎉/👍/💪 ตามคะแนน          │
  │   เวลาที่ใช้                  │
  │   AI แนะนำ: "ควรทบทวน..."    │
  │   ทบทวนคำตอบทุกข้อ           │
  │                               │── คืน PDF + สรุป + Chat
```

### Flow 5: Flashcards
```
ผู้ใช้                          ระบบ
  │                               │
  │── เปิด tab Flashcards ──────▶│── แสดงการ์ด (cached จาก auto-gen)
  │── คลิกการ์ด → พลิกดูคำตอบ ──│── CSS flip animation
  │── กด ◀ ▶ เลื่อนการ์ด ───────│
  │── กด "สร้างใหม่" ───────────▶│── POST /flashcards (regenerate=true)
  │◄── การ์ดชุดใหม่ ─────────────│
```

---

## 3. Document Processing Pipeline

```
User อัปโหลด PDF/รูปภาพ
    │
    ▼
① POST /upload/url → Presigned URL + DynamoDB record (status: uploading)
    │
    ▼
② Browser PUT ไฟล์ตรงไป S3 (presigned URL, Signature V4, regional endpoint)
    │
    ▼
③ POST /documents/{id}/process
    │
    ├── PDF? → PyPDF2 extract text
    │   ├── ได้ text > 50 chars? → status: ready ──→ ④
    │   └── ไม่ได้ → Textract async
    │
    └── Image? → Textract async (start_document_text_detection)
        │
        ▼
    Frontend poll GET /status ทุก 3 วินาที
    → Lambda check Textract job
    → SUCCEEDED → extract text → status: ready ──→ ④
    → FAILED → status: error
    │
    ▼
④ Auto-generate (frontend fires 3 calls in parallel):
    ├── POST /summarize → AI สรุป + topic + keyPoints → cache DynamoDB
    ├── POST /flashcards → AI สร้าง 10-15 การ์ด → cache DynamoDB
    └── POST /quiz → AI สร้าง 10 ข้อ MCQ → save DynamoDB
```

---

## 4. AI Model Selection Flow

```
User เลือก model จาก navbar dropdown
    │
    ▼
localStorage บันทึก provider ID
    │
    ▼
ทุก API call → Header: X-Model-Provider: {provider}
    │
    ▼
Lambda → bedrock_client.py → get_provider_from_event()
    │
    ├── "claude" → Bedrock Anthropic API (Claude Haiku 4.5)
    ├── "nova" → Bedrock Nova API (Nova Micro)
    ├── "openrouter-*" → OpenRouter API (free models)
    └── "local" → LM Studio (localhost, dev only)
```

---

## 5. Rate Limiting Flow

```
User ส่ง AI request
    │
    ▼
① check_and_increment_usage(userId)
   → DynamoDB atomic counter: USAGE#YYYY-MM-DD
   → ConditionExpression: count < 50
   → ถ้าเกิน → 429 "ถึงขีดจำกัด 50 ครั้ง/วัน"
   → TTL auto-delete เที่ยงคืน UTC
    │
    ▼
② Chat: ตรวจ per-document limit
   → นับ user messages ใน chat history
   → ถ้า >= 20 → 429 "ถึงขีดจำกัด 20 ข้อความ/เอกสาร"
   → แสดง remaining count ใน chat header
    │
    ▼
③ Quiz custom prompt: จำกัด 200 ตัวอักษร (server-side truncate)
```
