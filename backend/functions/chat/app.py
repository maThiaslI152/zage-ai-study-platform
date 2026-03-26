"""
POST /documents/{documentId}/chat

Answers a student's question using the document context.
Uses the cached summary as primary context (cheaper), falls back to
truncated extracted text if no summary exists.
Maintains conversation history (last 6 messages) stored in DynamoDB.

Request body:
  { "message": "What is the main concept in chapter 3?" }

Response:
  { "reply": "Based on the document, chapter 3 covers..." }
"""
import json

from shared.auth import get_user_id
from shared.bedrock_client import invoke_model, truncate_text, get_provider_from_event
from shared.dynamo_client import (
    get_document,
    get_chat_history,
    save_chat_message,
    check_and_increment_usage,
)


_SYSTEM_PROMPT = """\
You are a helpful study tutor. Answer the student's question based ONLY on the
provided study material. If the answer is not found in the material, say so honestly.
Be concise but thorough. Match the language of the question (Thai or English).\
"""

_PROMPT_TEMPLATE = """\
Study Material:
{text}

Previous conversation:
{history}

Student's question: {message}

Answer the question based solely on the study material above.\
"""

_MAX_HISTORY_CHARS = 3000  # ~750 tokens budget for history
_CHAT_LIMIT_PER_DOC = 20  # max user messages per document


def _cors_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": _cors_headers(),
        "body": json.dumps(body, ensure_ascii=False),
    }


def _format_history(messages: list[dict]) -> str:
    if not messages:
        return "(no previous messages)"
    lines = []
    total_chars = 0
    # Build from newest to oldest, then reverse — so we keep the most recent
    for m in reversed(messages):
        role = "Student" if m.get("role") == "user" else "Tutor"
        content = m.get("content", "")
        line = f"{role}: {content}"
        if total_chars + len(line) > _MAX_HISTORY_CHARS:
            break
        lines.append(line)
        total_chars += len(line)
    lines.reverse()
    return "\n".join(lines) if lines else "(no previous messages)"


def _build_context(doc: dict) -> str:
    """
    Use summary + keyPoints as context if available (much cheaper).
    Fall back to truncated extracted text.
    """
    summary = doc.get("summary", "").strip()
    key_points = doc.get("keyPoints", [])

    if summary and key_points:
        kp_text = "\n".join(f"- {p}" for p in key_points)
        context = f"{summary}\n\nKey Points:\n{kp_text}"
        # Also append a small portion of extracted text for detail
        extracted = doc.get("extractedText", "").strip()
        if extracted:
            context += "\n\nDetailed content:\n" + truncate_text(extracted, max_tokens=3000)
        return context

    # No summary — use extracted text directly
    extracted = doc.get("extractedText", "").strip()
    return truncate_text(extracted, max_tokens=5000)


def handler(event: dict, context) -> dict:
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    document_id = (event.get("pathParameters") or {}).get("documentId")
    if not document_id:
        return _response(400, {"error": "Missing documentId", "code": "BAD_REQUEST"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body", "code": "BAD_REQUEST"})

    user_message = (body.get("message") or "").strip()
    if not user_message:
        return _response(400, {"error": "message is required", "code": "BAD_REQUEST"})

    if len(user_message) > 2000:
        return _response(400, {"error": "Message too long (max 2000 characters)", "code": "BAD_REQUEST"})

    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})

    if doc.get("status") != "ready":
        return _response(400, {"error": "Document is not ready yet", "code": "NOT_READY"})

    extracted_text = doc.get("extractedText", "").strip()
    if not extracted_text:
        return _response(400, {"error": "Document has no extracted text", "code": "NO_TEXT"})

    # Rate limiting (global daily)
    if not check_and_increment_usage(user_id):
        return _response(429, {"error": "Daily AI request limit reached (50/day)", "code": "RATE_LIMIT"})

    # Per-document chat limit
    history = get_chat_history(document_id, limit=100)
    user_msg_count = sum(1 for m in history if m.get("role") == "user")
    remaining = max(0, _CHAT_LIMIT_PER_DOC - user_msg_count)

    if remaining <= 0:
        return _response(429, {
            "error": f"ถึงขีดจำกัดการถาม AI สำหรับเอกสารนี้แล้ว ({_CHAT_LIMIT_PER_DOC} ข้อความ)",
            "code": "DOC_CHAT_LIMIT",
            "remaining": 0,
        })

    # Use last 6 for context
    recent_history = history[-6:] if len(history) >= 6 else history
    history_text = _format_history(recent_history)

    # Use smart context (summary when available, cheaper)
    context_text = _build_context(doc)

    prompt = _PROMPT_TEMPLATE.format(
        text=context_text,
        history=history_text,
        message=user_message,
    )

    try:
        provider = get_provider_from_event(event)
        reply = invoke_model(prompt, max_tokens=800, system=_SYSTEM_PROMPT, provider=provider)
    except Exception as exc:
        print(f"ERROR calling Bedrock: {exc}")
        return _response(500, {"error": "AI chat failed", "code": "AI_ERROR"})

    # Persist both turns
    save_chat_message(document_id, user_id, role="user", content=user_message)
    save_chat_message(document_id, user_id, role="assistant", content=reply)

    return _response(200, {"reply": reply, "remaining": remaining - 1})
