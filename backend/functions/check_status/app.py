"""
GET /documents/{documentId}/status

Polls the Textract job status for a document that's still processing.
If the job is complete, extracts text and updates DynamoDB to "ready".

Response:
  { "status": "processing|ready|error", "documentId": "..." }
"""
import json
import os

import boto3

from shared.auth import get_user_id
from shared.dynamo_client import get_document, update_document

_textract = None


def _get_textract():
    global _textract
    if _textract is None:
        _textract = boto3.client(
            "textract", region_name=os.environ.get("AWS_REGION", "ap-southeast-1")
        )
    return _textract


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


def _extract_lines_from_blocks(blocks: list) -> str:
    return "\n".join(b["Text"] for b in blocks if b.get("BlockType") == "LINE")


def handler(event: dict, context) -> dict:
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

    current_status = doc.get("status", "")

    # Already done or failed — return immediately
    if current_status in ("ready", "error"):
        return _response(200, {"status": current_status, "documentId": document_id})

    # No Textract job — might have been processed via PyPDF2 already
    job_id = doc.get("textractJobId")
    if not job_id:
        return _response(200, {"status": current_status, "documentId": document_id})

    # Poll Textract
    try:
        textract = _get_textract()
        result = textract.get_document_text_detection(JobId=job_id)
        job_status = result["JobStatus"]

        if job_status == "IN_PROGRESS":
            return _response(200, {"status": "processing", "documentId": document_id})

        if job_status == "FAILED":
            error_msg = result.get("StatusMessage", "Textract job failed")
            update_document(user_id, document_id, status="error", errorMessage=error_msg[:500])
            return _response(200, {"status": "error", "documentId": document_id})

        if job_status == "SUCCEEDED":
            # Collect all pages
            all_blocks = list(result.get("Blocks", []))
            while "NextToken" in result:
                result = textract.get_document_text_detection(
                    JobId=job_id, NextToken=result["NextToken"]
                )
                all_blocks.extend(result.get("Blocks", []))

            extracted_text = _extract_lines_from_blocks(all_blocks)

            if not extracted_text.strip():
                update_document(
                    user_id, document_id,
                    status="error",
                    errorMessage="Textract returned empty text",
                )
                return _response(200, {"status": "error", "documentId": document_id})

            update_document(
                user_id, document_id,
                status="ready",
                extractedText=extracted_text,
            )
            return _response(200, {"status": "ready", "documentId": document_id})

        # Unknown status
        return _response(200, {"status": "processing", "documentId": document_id})

    except Exception as exc:
        print(f"ERROR checking Textract status for {document_id}: {exc}")
        return _response(500, {"error": "Status check failed", "code": "INTERNAL_ERROR"})
