"""
POST /upload/url

Generates a presigned S3 PUT URL so the browser can upload directly to S3.
Creates a DynamoDB document record with status=uploading.

Request body:
  { "fileName": "lecture.pdf", "fileType": "application/pdf" }

Response:
  { "uploadUrl": "...", "documentId": "uuid", "s3Key": "uploads/..." }
"""
import json
import os
import uuid

import boto3
from botocore.config import Config as BotoConfig

from shared.auth import get_user_id
from shared.dynamo_client import create_document

_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        region = os.environ.get("AWS_REGION", "ap-southeast-1")
        _s3 = boto3.client(
            "s3",
            region_name=region,
            config=BotoConfig(s3={"addressing_style": "virtual"}, signature_version="s3v4"),
        )
    return _s3


ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/tiff",
}

PRESIGNED_URL_TTL = 300  # 5 minutes


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

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body", "code": "BAD_REQUEST"})

    file_name = (body.get("fileName") or "").strip()
    file_type = (body.get("fileType") or "").strip().lower()
    subject_id = (body.get("subjectId") or "").strip()

    if not file_name or not file_type:
        return _response(400, {"error": "fileName and fileType are required", "code": "BAD_REQUEST"})

    if file_type not in ALLOWED_CONTENT_TYPES:
        return _response(
            400,
            {
                "error": f"Unsupported file type: {file_type}. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
                "code": "UNSUPPORTED_FILE_TYPE",
            },
        )

    document_id = str(uuid.uuid4())
    s3_key = f"uploads/{user_id}/{document_id}/{file_name}"
    bucket = os.environ["UPLOAD_BUCKET"]

    # Determine the internal fileType label for the document record
    internal_type = "pdf" if file_type == "application/pdf" else "image"

    try:
        upload_url = _get_s3().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": s3_key,
                "ContentType": file_type,
            },
            ExpiresIn=PRESIGNED_URL_TTL,
        )
    except Exception as exc:
        print(f"ERROR generating presigned URL: {exc}")
        return _response(500, {"error": "Could not generate upload URL", "code": "INTERNAL_ERROR"})

    try:
        create_document(
            user_id=user_id,
            document_id=document_id,
            file_name=file_name,
            file_type=internal_type,
            s3_key=s3_key,
            subject_id=subject_id,
        )
    except Exception as exc:
        print(f"ERROR writing DynamoDB record: {exc}")
        return _response(500, {"error": "Could not create document record", "code": "INTERNAL_ERROR"})

    return _response(
        200,
        {
            "uploadUrl": upload_url,
            "documentId": document_id,
            "s3Key": s3_key,
        },
    )
