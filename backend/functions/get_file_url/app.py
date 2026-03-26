"""
GET /documents/{documentId}/file

Returns a presigned GET URL for the original uploaded file.
"""
import json
import os
import boto3
from botocore.config import Config as BotoConfig
from shared.auth import get_user_id
from shared.dynamo_client import get_document

_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        region = os.environ.get("AWS_REGION", "ap-southeast-1")
        _s3 = boto3.client(
            "s3", region_name=region,
            config=BotoConfig(s3={"addressing_style": "virtual"}, signature_version="s3v4"),
        )
    return _s3


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

    bucket = os.environ["UPLOAD_BUCKET"]
    s3_key = doc.get("s3Key", "")

    try:
        url = _get_s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=3600,
        )
    except Exception as exc:
        return _response(500, {"error": "Could not generate file URL", "code": "INTERNAL_ERROR"})

    return _response(200, {"fileUrl": url, "fileType": doc.get("fileType", "pdf")})
