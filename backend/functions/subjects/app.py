"""
Subjects CRUD:
  GET    /subjects              → list all subjects for user
  POST   /subjects              → create a new subject
  DELETE /subjects/{subjectId}  → delete a subject
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from shared.auth import get_user_id

_dynamodb = None


def _get_resource():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-southeast-1"))
    return _dynamodb


def _subjects_table():
    return _get_resource().Table(os.environ["SUBJECTS_TABLE"])


def _documents_table():
    return _get_resource().Table(os.environ["DOCUMENTS_TABLE"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _list_subjects(user_id: str) -> dict:
    response = _subjects_table().query(
        KeyConditionExpression=Key("userId").eq(user_id),
    )
    subjects = response.get("Items", [])

    # Count documents per subject
    for subj in subjects:
        doc_resp = _documents_table().query(
            KeyConditionExpression=Key("userId").eq(user_id),
            FilterExpression="#sid = :sid",
            ExpressionAttributeNames={"#sid": "subjectId"},
            ExpressionAttributeValues={":sid": subj["subjectId"]},
            Select="COUNT",
        )
        subj["documentCount"] = doc_resp.get("Count", 0)

    subjects.sort(key=lambda s: s.get("createdAt", ""), reverse=True)
    return _response(200, {"subjects": subjects})


def _create_subject(user_id: str, event: dict) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body", "code": "BAD_REQUEST"})

    name = (body.get("name") or "").strip()
    if not name:
        return _response(400, {"error": "Subject name is required", "code": "BAD_REQUEST"})

    subject_id = str(uuid.uuid4())
    item = {
        "userId": user_id,
        "subjectId": subject_id,
        "name": name,
        "createdAt": _now_iso(),
    }
    _subjects_table().put_item(Item=item)

    return _response(200, {"subject": item})


def _delete_subject(user_id: str, subject_id: str) -> dict:
    _subjects_table().delete_item(
        Key={"userId": user_id, "subjectId": subject_id}
    )
    return _response(200, {"deleted": True, "subjectId": subject_id})


def handler(event: dict, context) -> dict:
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return _response(401, {"error": str(exc), "code": "UNAUTHORIZED"})

    method = event.get("httpMethod", "GET")

    if method == "GET":
        return _list_subjects(user_id)
    elif method == "POST":
        return _create_subject(user_id, event)
    elif method == "DELETE":
        subject_id = (event.get("pathParameters") or {}).get("subjectId")
        if not subject_id:
            return _response(400, {"error": "Missing subjectId", "code": "BAD_REQUEST"})
        return _delete_subject(user_id, subject_id)
    else:
        return _response(405, {"error": "Method not allowed"})
