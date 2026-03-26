"""
POST /documents/{documentId}/process

Kicks off Textract asynchronously and returns immediately.
Stores the Textract jobId in DynamoDB so check_status can poll it.

For digital PDFs, uses PyPDF2 first (free, fast). Falls back to Textract
only for images or if PyPDF2 extraction fails.

Response:
  { "status": "processing", "documentId": "..." }
"""
import json
import os
import io

import boto3

from shared.auth import get_user_id
from shared.dynamo_client import get_document, update_document

_textract = None
_s3 = None


def _get_textract():
    global _textract
    if _textract is None:
        _textract = boto3.client(
            "textract", region_name=os.environ.get("AWS_REGION", "ap-southeast-1")
        )
    return _textract


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3", region_name=os.environ.get("AWS_REGION", "ap-southeast-1")
        )
    return _s3


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


def _try_pypdf2(bucket: str, s3_key: str) -> str | None:
    """
    Try extracting text from a digital PDF using PyPDF2.
    Returns extracted text or None if it fails or yields no text.
    """
    try:
        from PyPDF2 import PdfReader

        obj = _get_s3().get_object(Bucket=bucket, Key=s3_key)
        pdf_bytes = obj["Body"].read()
        reader = PdfReader(io.BytesIO(pdf_bytes))

        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())

        full_text = "\n\n".join(pages).strip()
        # If we got meaningful text (more than just whitespace/headers), use it
        if len(full_text) > 50:
            return full_text
        return None
    except Exception as exc:
        print(f"PyPDF2 extraction failed, falling back to Textract: {exc}")
        return None


def handler(event: dict, context) -> dict:
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    document_id = (event.get("pathParameters") or {}).get("documentId")
    if not document_id:
        return _response(400, {"error": "Missing documentId in path", "code": "BAD_REQUEST"})

    doc = get_document(user_id, document_id)
    if not doc:
        return _response(404, {"error": "Document not found", "code": "NOT_FOUND"})

    if doc.get("status") == "ready":
        return _response(200, {"status": "ready", "documentId": document_id})

    bucket = os.environ["UPLOAD_BUCKET"]
    s3_key = doc.get("s3Key", "")
    file_type = doc.get("fileType", "pdf")

    # Mark as processing
    update_document(user_id, document_id, status="processing")

    # For PDFs, try PyPDF2 first (free + fast for digital PDFs)
    if file_type == "pdf":
        extracted = _try_pypdf2(bucket, s3_key)
        if extracted:
            update_document(
                user_id,
                document_id,
                status="ready",
                extractedText=extracted,
            )
            return _response(200, {"status": "ready", "documentId": document_id})

    # Fall back to Textract (async) for images or when PyPDF2 fails
    try:
        textract = _get_textract()
        response = textract.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": bucket, "Name": s3_key}}
        )
        job_id = response["JobId"]

        # Store jobId so check_status Lambda can poll it
        update_document(user_id, document_id, textractJobId=job_id)

        return _response(200, {"status": "processing", "documentId": document_id})

    except Exception as exc:
        print(f"ERROR starting Textract for {document_id}: {exc}")
        update_document(
            user_id,
            document_id,
            status="error",
            errorMessage=str(exc)[:500],
        )
        return _response(500, {"error": "Document processing failed", "code": "PROCESSING_ERROR"})
