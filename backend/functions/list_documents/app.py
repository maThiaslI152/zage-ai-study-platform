"""
GET /documents

Returns all documents belonging to the authenticated user,
sorted newest first. extractedText is excluded (can be large).

Response:
  { "documents": [ { documentId, fileName, fileType, status, createdAt, hasSummary } ] }
"""
import json

from shared.auth import get_user_id
from shared.dynamo_client import list_documents


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
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def handler(event: dict, context) -> dict:
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    try:
        docs = list_documents(user_id)
    except Exception as exc:
        print(f"ERROR querying documents: {exc}")
        return _response(500, {"error": "Could not fetch documents", "code": "INTERNAL_ERROR"})

    return _response(200, {"documents": docs})
