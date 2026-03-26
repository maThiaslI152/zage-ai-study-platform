"""
POST /documents/{documentId}/summarize

Generates an AI summary of the document's extracted text.
Caches the result in DynamoDB. Subsequent calls return the cached version
unless the client sends { "regenerate": true }.

Response:
  { "summary": "...", "keyPoints": ["...", "..."] }
"""
import json

from shared.auth import get_user_id
from shared.bedrock_client import invoke_model_json, truncate_text, get_provider_from_event
from shared.dynamo_client import get_document, update_document, check_and_increment_usage


_SYSTEM_PROMPT = (
    "You are a concise study assistant. Always respond with valid JSON only — "
    "no markdown, no extra text, just the JSON object."
)

_PROMPT_TEMPLATE = """\
Summarize the following study material clearly and concisely.

Rules:
- Use simple language appropriate for students
- Keep the summary under 500 words
- Include 3–7 key bullet points in the "keyPoints" array
- Create a short topic title (max 60 chars) that describes the main subject of this material
- If the text is in Thai, respond in Thai. If in English, respond in English.

Study Material:
{text}

Respond ONLY in this exact JSON format:
{{
  "topic": "short topic title here",
  "summary": "paragraph summary here",
  "keyPoints": ["point 1", "point 2", "point 3"]
}}
"""


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

    regenerate = body.get("regenerate", False)

    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})

    if doc.get("status") != "ready":
        return _response(400, {"error": "Document is not ready yet", "code": "NOT_READY"})

    # Return cached summary unless regeneration is requested
    if not regenerate and doc.get("summary") and doc.get("keyPoints"):
        return _response(200, {
            "summary": doc["summary"],
            "keyPoints": doc["keyPoints"],
            "topic": doc.get("topic", ""),
            "cached": True,
        })

    extracted_text = doc.get("extractedText", "").strip()
    if not extracted_text:
        return _response(400, {"error": "Document has no extracted text", "code": "NO_TEXT"})

    # Rate limiting
    if not check_and_increment_usage(user_id):
        return _response(429, {"error": "Daily AI request limit reached (50/day)", "code": "RATE_LIMIT"})

    prompt = _PROMPT_TEMPLATE.format(text=truncate_text(extracted_text))

    try:
        provider = get_provider_from_event(event)
        result = invoke_model_json(prompt, max_tokens=1500, system=_SYSTEM_PROMPT, provider=provider)
    except Exception as exc:
        print(f"ERROR calling Bedrock: {exc}")
        return _response(500, {"error": "AI summarization failed", "code": "AI_ERROR"})

    summary = result.get("summary", "")
    key_points = result.get("keyPoints", [])
    topic = result.get("topic", "")

    if not isinstance(key_points, list):
        key_points = []

    # Cache in DynamoDB
    update_document(
        user_id,
        document_id,
        summary=summary,
        keyPoints=key_points,
        topic=topic,
        hasSummary=True,
    )

    return _response(200, {"summary": summary, "keyPoints": key_points, "topic": topic, "cached": False})
