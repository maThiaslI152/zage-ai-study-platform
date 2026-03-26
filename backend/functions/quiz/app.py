"""
Quiz endpoints:
  POST /documents/{documentId}/quiz           → generate a new quiz (10 MCQ)
  GET  /documents/{documentId}/quiz           → list all quizzes for this doc
  POST /documents/{documentId}/quiz/{quizId}/submit → submit answers, get score
"""
import json

from shared.auth import get_user_id
from shared.bedrock_client import invoke_model, invoke_model_json, truncate_text, get_provider_from_event
from shared.dynamo_client import (
    get_document,
    save_quiz,
    get_quiz,
    list_quizzes,
    update_quiz_score,
    check_and_increment_usage,
)

_SYSTEM_PROMPT = (
    "You are a quiz generator for students. Always respond with a valid JSON array only — "
    "no markdown, no extra text, just the JSON array."
)

_PROMPT_TEMPLATE = """\
Create a multiple-choice quiz from the following study material.

Rules:
- Create exactly 10 questions
- Cover a WIDE RANGE of topics from the material — don't focus on just one section
- Each question has exactly 4 choices (A, B, C, D)
- Exactly one correct answer per question
- Include a brief explanation for the correct answer (1-2 sentences)
- Vary difficulty: 3 easy, 4 medium, 3 hard
- Match the language of the source material (Thai or English)
{custom_instruction}

Study Material:
{text}

Respond ONLY as a JSON array:
[
  {{
    "question": "คำถาม?",
    "choices": {{"A": "ตัวเลือก A", "B": "ตัวเลือก B", "C": "ตัวเลือก C", "D": "ตัวเลือก D"}},
    "answer": "A",
    "explanation": "คำอธิบาย",
    "difficulty": "easy"
  }}
]
"""


def _cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }


def _response(status, body):
    return {"statusCode": status, "headers": _cors_headers(), "body": json.dumps(body, ensure_ascii=False, default=str)}


def _handle_generate(user_id, document_id, event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        body = {}

    custom_prompt = (body.get("customPrompt") or "").strip()[:200]  # Max 200 chars

    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})
    if doc.get("status") != "ready":
        return _response(400, {"error": "Document is not ready yet", "code": "NOT_READY"})

    extracted_text = doc.get("extractedText", "").strip()
    if not extracted_text:
        return _response(400, {"error": "Document has no extracted text", "code": "NO_TEXT"})

    if not check_and_increment_usage(user_id):
        return _response(429, {"error": "Daily AI request limit reached (50/day)", "code": "RATE_LIMIT"})

    # Determine quiz number
    existing = list_quizzes(document_id)
    quiz_number = len(existing) + 1

    # Build custom instruction
    custom_instruction = ""
    if custom_prompt:
        custom_instruction = f"\nAdditional instruction from the student: {custom_prompt}"

    prompt = _PROMPT_TEMPLATE.format(
        text=truncate_text(extracted_text),
        custom_instruction=custom_instruction,
    )

    try:
        provider = get_provider_from_event(event)
        raw = invoke_model_json(prompt, max_tokens=2000, system=_SYSTEM_PROMPT, provider=provider)
    except Exception as exc:
        print(f"ERROR generating quiz: {exc}")
        return _response(500, {"error": "Quiz generation failed", "code": "AI_ERROR"})

    if not isinstance(raw, list):
        return _response(500, {"error": "AI returned unexpected format", "code": "AI_ERROR"})

    # Validate questions
    questions = []
    for q in raw:
        if (isinstance(q, dict) and q.get("question") and q.get("choices")
                and q.get("answer") and q["answer"] in ("A", "B", "C", "D")):
            questions.append({
                "question": q["question"],
                "choices": q["choices"],
                "answer": q["answer"],
                "explanation": q.get("explanation", ""),
                "difficulty": q.get("difficulty", "medium"),
            })

    if len(questions) < 3:
        return _response(500, {"error": "AI generated too few valid questions", "code": "AI_ERROR"})

    saved = save_quiz(document_id, user_id, quiz_number, questions)

    # Return quiz WITHOUT answers (client shouldn't see them before submitting)
    safe_questions = [
        {"question": q["question"], "choices": q["choices"], "difficulty": q["difficulty"]}
        for q in questions
    ]

    return _response(200, {
        "quizId": saved["quizId"],
        "quizNumber": quiz_number,
        "questions": safe_questions,
        "totalQuestions": len(questions),
    })


def _handle_list(user_id, document_id):
    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})

    quizzes = list_quizzes(document_id)
    return _response(200, {"quizzes": quizzes})


def _handle_get_quiz(user_id, document_id, quiz_id):
    quiz = get_quiz(document_id, quiz_id)
    if not quiz:
        return _response(404, {"error": "Quiz not found", "code": "NOT_FOUND"})

    questions = quiz.get("questions", [])
    has_score = quiz.get("score") is not None

    # Return questions without answers if not yet submitted
    if not has_score:
        safe_questions = [
            {"question": q["question"], "choices": q["choices"], "difficulty": q.get("difficulty", "medium")}
            for q in questions
        ]
        return _response(200, {
            "quizId": quiz_id,
            "quizNumber": quiz.get("quizNumber", 0),
            "questions": safe_questions,
            "totalQuestions": len(questions),
            "score": None,
        })

    # Already submitted — return full results
    return _response(200, {
        "quizId": quiz_id,
        "quizNumber": quiz.get("quizNumber", 0),
        "questions": [
            {"question": q["question"], "choices": q["choices"], "difficulty": q.get("difficulty", "medium")}
            for q in questions
        ],
        "totalQuestions": len(questions),
        "score": quiz.get("score"),
    })


def _handle_submit(user_id, document_id, quiz_id, event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body", "code": "BAD_REQUEST"})

    answers = body.get("answers", [])  # ["A", "B", "C", ...]

    quiz = get_quiz(document_id, quiz_id)
    if not quiz:
        return _response(404, {"error": "Quiz not found", "code": "NOT_FOUND"})

    questions = quiz.get("questions", [])
    if len(answers) != len(questions):
        return _response(400, {"error": f"Expected {len(questions)} answers, got {len(answers)}", "code": "BAD_REQUEST"})

    # Grade
    results = []
    correct_count = 0
    wrong_topics = []
    for i, q in enumerate(questions):
        user_answer = answers[i] if i < len(answers) else ""
        is_correct = user_answer == q["answer"]
        if is_correct:
            correct_count += 1
        else:
            wrong_topics.append(q["question"])
        results.append({
            "question": q["question"],
            "choices": q["choices"],
            "userAnswer": user_answer,
            "correctAnswer": q["answer"],
            "isCorrect": is_correct,
            "explanation": q.get("explanation", ""),
            "difficulty": q.get("difficulty", "medium"),
        })

    # Save score
    update_quiz_score(document_id, quiz_id, correct_count)

    # Generate AI study suggestion based on wrong answers
    suggestion = ""
    if wrong_topics and correct_count < len(questions):
        try:
            wrong_list = "\n".join(f"- {t}" for t in wrong_topics[:5])
            suggestion_prompt = (
                f"นักศึกษาทำ Quiz ได้ {correct_count}/{len(questions)} ข้อ\n"
                f"ข้อที่ตอบผิด:\n{wrong_list}\n\n"
                "จากข้อที่ตอบผิด ให้คำแนะนำสั้นๆ (3-5 ประโยค) ว่านักศึกษาควรทบทวนเรื่องอะไรบ้าง "
                "ตอบเป็นภาษาเดียวกับคำถาม ให้กำลังใจด้วย"
            )
            suggestion = invoke_claude(suggestion_prompt, max_tokens=300, system="You are a supportive study tutor.")
        except Exception as exc:
            print(f"Suggestion generation failed (non-critical): {exc}")
            suggestion = ""

    return _response(200, {
        "score": correct_count,
        "totalQuestions": len(questions),
        "percentage": round(correct_count / len(questions) * 100),
        "results": results,
        "suggestion": suggestion,
    })


def handler(event, context):
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    method = event.get("httpMethod", "GET")
    document_id = (event.get("pathParameters") or {}).get("documentId")
    quiz_id = (event.get("pathParameters") or {}).get("quizId")

    if not document_id:
        return _response(400, {"error": "Missing documentId", "code": "BAD_REQUEST"})

    if method == "GET" and quiz_id:
        return _handle_get_quiz(user_id, document_id, quiz_id)
    elif method == "GET":
        return _handle_list(user_id, document_id)
    elif method == "POST" and quiz_id:
        return _handle_submit(user_id, document_id, quiz_id, event)
    elif method == "POST":
        return _handle_generate(user_id, document_id, event)
    else:
        return _response(405, {"error": "Method not allowed"})
