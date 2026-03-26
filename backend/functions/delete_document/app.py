"""
DELETE /documents/{documentId}

Deletes a document and all related chats/flashcards.
"""
import json
from shared.auth import get_user_id
from shared.dynamo_client import get_document, delete_document


def _cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }


def _response(status, body):
    return {"statusCode": status, "headers": _cors_headers(), "body": json.dumps(body)}


def handler(event, context):
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    document_id = (event.get("pathParameters") or {}).get("documentId")
    if not document_id:
        return _response(400, {"error": "Missing documentId", "code": "BAD_REQUEST"})

    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})

    try:
        delete_document(user_id, document_id)
    except Exception as exc:
        print(f"ERROR deleting document {document_id}: {exc}")
        return _response(500, {"error": "Delete failed", "code": "INTERNAL_ERROR"})

    return _response(200, {"deleted": True, "documentId": document_id})
