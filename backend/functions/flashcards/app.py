"""
POST /documents/{documentId}/flashcards

Generates flashcards from the document's extracted text.
Returns cached flashcards if they already exist, unless { "regenerate": true }.

Response:
  { "flashcards": [ { "cardId": "uuid", "front": "...", "back": "..." } ] }
"""
import json

from shared.auth import get_user_id
from shared.bedrock_client import invoke_model_json, truncate_text, get_provider_from_event
from shared.dynamo_client import (
    get_document,
    get_flashcards,
    save_flashcards,
    check_and_increment_usage,
)


_SYSTEM_PROMPT = (
    "You are a study assistant. Always respond with a valid JSON array only — "
    "no markdown, no extra text, just the JSON array."
)

_PROMPT_TEMPLATE = """\
Create flashcards from the following study material.

Rules:
- Create 10–15 flashcards covering the most important concepts
- Front: a clear question or term (one sentence)
- Back: a concise answer or definition (1–3 sentences max)
- Match the language of the source material (Thai or English)

Study Material:
{text}

Respond ONLY as a JSON array, no other text:
[
  {{"front": "Question or term?", "back": "Answer or definition."}},
  ...
]
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

    # Return cached flashcards unless regeneration is requested
    if not regenerate:
        cached = get_flashcards(document_id)
        if cached:
            cards = [
                {"cardId": c["cardId"], "front": c["front"], "back": c["back"]}
                for c in cached
            ]
            return _response(200, {"flashcards": cards, "cached": True})

    extracted_text = doc.get("extractedText", "").strip()
    if not extracted_text:
        return _response(400, {"error": "Document has no extracted text", "code": "NO_TEXT"})

    # Rate limiting
    if not check_and_increment_usage(user_id):
        return _response(429, {"error": "Daily AI request limit reached (50/day)", "code": "RATE_LIMIT"})

    prompt = _PROMPT_TEMPLATE.format(text=truncate_text(extracted_text))

    try:
        provider = get_provider_from_event(event)
        raw_cards = invoke_model_json(prompt, max_tokens=2048, system=_SYSTEM_PROMPT, provider=provider)
    except Exception as exc:
        print(f"ERROR calling Bedrock: {exc}")
        return _response(500, {"error": "AI flashcard generation failed", "code": "AI_ERROR"})

    if not isinstance(raw_cards, list):
        return _response(500, {"error": "AI returned unexpected format", "code": "AI_ERROR"})

    # Validate each card has front/back
    valid_cards = [
        c for c in raw_cards if isinstance(c, dict) and c.get("front") and c.get("back")
    ]

    if not valid_cards:
        return _response(500, {"error": "AI returned no valid flashcards", "code": "AI_ERROR"})

    # Persist (replace existing)
    saved = save_flashcards(document_id, user_id, valid_cards)
    result = [{"cardId": c["cardId"], "front": c["front"], "back": c["back"]} for c in saved]

    return _response(200, {"flashcards": result, "cached": False})
