"""
DynamoDB helpers for all Zage tables.
Uses a single boto3 resource (connection pooling via Lambda container reuse).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key

_dynamodb = None


def _get_resource():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-southeast-1"))
    return _dynamodb


def _documents_table():
    return _get_resource().Table(os.environ["DOCUMENTS_TABLE"])


def _chats_table():
    return _get_resource().Table(os.environ["CHATS_TABLE"])


def _flashcards_table():
    return _get_resource().Table(os.environ["FLASHCARDS_TABLE"])


def _quizzes_table():
    return _get_resource().Table(os.environ["QUIZZES_TABLE"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Documents ─────────────────────────────────────────────────────────────────

def create_document(user_id: str, document_id: str, file_name: str, file_type: str, s3_key: str, subject_id: str = "") -> dict:
    """Create a new document record with status=uploading."""
    item = {
        "userId": user_id,
        "documentId": document_id,
        "fileName": file_name,
        "fileType": file_type,
        "s3Key": s3_key,
        "subjectId": subject_id,
        "status": "uploading",
        "hasSummary": False,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    _documents_table().put_item(Item=item)
    return item


def get_document(user_id: str, document_id: str) -> dict | None:
    """Fetch a single document. Returns None if not found."""
    response = _documents_table().get_item(
        Key={"userId": user_id, "documentId": document_id}
    )
    return response.get("Item")


def delete_document(user_id: str, document_id: str) -> None:
    """Delete a document and its related chats and flashcards."""
    _documents_table().delete_item(
        Key={"userId": user_id, "documentId": document_id}
    )
    # Clean up related chats
    chat_resp = _chats_table().query(
        KeyConditionExpression=Key("documentId").eq(document_id),
        ProjectionExpression="documentId, #ts",
        ExpressionAttributeNames={"#ts": "timestamp"},
    )
    with _chats_table().batch_writer() as batch:
        for item in chat_resp.get("Items", []):
            batch.delete_item(Key={"documentId": item["documentId"], "timestamp": item["timestamp"]})
    # Clean up related flashcards
    fc_resp = _flashcards_table().query(
        KeyConditionExpression=Key("documentId").eq(document_id),
        ProjectionExpression="documentId, cardId",
    )
    with _flashcards_table().batch_writer() as batch:
        for item in fc_resp.get("Items", []):
            batch.delete_item(Key={"documentId": item["documentId"], "cardId": item["cardId"]})


def update_document(user_id: str, document_id: str, **fields) -> None:
    """
    Update arbitrary fields on a document record.
    Usage: update_document(uid, did, status="ready", extractedText="...")
    """
    if not fields:
        return

    fields["updatedAt"] = _now_iso()

    set_expr = "SET " + ", ".join(f"#f_{k} = :v_{k}" for k in fields)
    expr_names = {f"#f_{k}": k for k in fields}
    expr_values = {f":v_{k}": v for k, v in fields.items()}

    _documents_table().update_item(
        Key={"userId": user_id, "documentId": document_id},
        UpdateExpression=set_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def list_documents(user_id: str) -> list[dict]:
    """Return all documents for a user, sorted by createdAt descending."""
    response = _documents_table().query(
        KeyConditionExpression=Key("userId").eq(user_id),
        # Exclude large fields not needed in the list view
        ProjectionExpression=(
            "documentId, fileName, fileType, #st, createdAt, hasSummary, subjectId, topic"
        ),
        ExpressionAttributeNames={"#st": "status"},
    )
    docs = response.get("Items", [])

    # Handle pagination
    while "LastEvaluatedKey" in response:
        response = _documents_table().query(
            KeyConditionExpression=Key("userId").eq(user_id),
            ProjectionExpression="documentId, fileName, fileType, #st, createdAt, hasSummary, subjectId, topic",
            ExpressionAttributeNames={"#st": "status"},
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        docs.extend(response.get("Items", []))

    docs.sort(key=lambda d: d.get("createdAt", ""), reverse=True)
    return docs


# ─── Chats ──────────────────────────────────────────────────────────────────

def save_chat_message(document_id: str, user_id: str, role: str, content: str) -> dict:
    """Append a single chat message (role: 'user' | 'assistant')."""
    item = {
        "documentId": document_id,
        "timestamp": _now_iso() + f"#{uuid.uuid4().hex[:8]}",  # unique within same ms
        "userId": user_id,
        "role": role,
        "content": content,
    }
    _chats_table().put_item(Item=item)
    return item


def get_chat_history(document_id: str, limit: int = 10) -> list[dict]:
    """Return the most recent `limit` messages for a document, oldest first."""
    response = _chats_table().query(
        KeyConditionExpression=Key("documentId").eq(document_id),
        ScanIndexForward=False,  # newest first
        Limit=limit,
    )
    messages = response.get("Items", [])
    messages.reverse()  # oldest first for context window
    return messages


# ─── Flashcards ─────────────────────────────────────────────────────────────

def save_flashcards(document_id: str, user_id: str, cards: list[dict]) -> list[dict]:
    """
    Replace all flashcards for a document.
    Each card in `cards` should have {"front": str, "back": str}.
    Returns the saved items with cardId and createdAt added.
    """
    table = _flashcards_table()
    now = _now_iso()
    saved = []

    with table.batch_writer() as batch:
        for card in cards:
            item = {
                "documentId": document_id,
                "cardId": str(uuid.uuid4()),
                "userId": user_id,
                "front": card.get("front", ""),
                "back": card.get("back", ""),
                "createdAt": now,
            }
            batch.put_item(Item=item)
            saved.append(item)

    return saved


def get_flashcards(document_id: str) -> list[dict]:
    """Return all flashcards for a document."""
    response = _flashcards_table().query(
        KeyConditionExpression=Key("documentId").eq(document_id),
    )
    return response.get("Items", [])


# ─── Rate limiting ──────────────────────────────────────────────────────────

DAILY_AI_LIMIT = 50
_USAGE_SK_PREFIX = "USAGE#"


def check_and_increment_usage(user_id: str) -> bool:
    """
    Atomically increment the daily AI usage counter for a user.
    Returns True if the request is allowed, False if the daily limit is exceeded.

    Uses DocumentsTable with a special SK = "USAGE#YYYY-MM-DD" and TTL = next midnight.
    """
    table = _documents_table()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sk = f"{_USAGE_SK_PREFIX}{today}"

    # Calculate TTL = midnight tonight UTC
    tomorrow = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ) + timedelta(days=1)
    ttl_epoch = int(tomorrow.timestamp())

    try:
        response = table.update_item(
            Key={"userId": user_id, "documentId": sk},
            UpdateExpression=(
                "SET #cnt = if_not_exists(#cnt, :zero) + :one, "
                "#ttl = if_not_exists(#ttl, :ttl)"
            ),
            ExpressionAttributeNames={"#cnt": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":zero": 0,
                ":one": 1,
                ":ttl": ttl_epoch,
                ":limit": DAILY_AI_LIMIT,
            },
            ConditionExpression="#cnt < :limit OR attribute_not_exists(#cnt)",
            ReturnValues="UPDATED_NEW",
        )
        return True
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return False


# ─── Quizzes ────────────────────────────────────────────────────────────────

def save_quiz(document_id: str, user_id: str, quiz_number: int, questions: list[dict]) -> dict:
    """Save a generated quiz. Returns the saved item."""
    quiz_id = str(uuid.uuid4())
    item = {
        "documentId": document_id,
        "quizId": quiz_id,
        "userId": user_id,
        "quizNumber": quiz_number,
        "questions": questions,
        "score": None,
        "totalQuestions": len(questions),
        "createdAt": _now_iso(),
    }
    _quizzes_table().put_item(Item=item)
    return item


def get_quiz(document_id: str, quiz_id: str) -> dict | None:
    """Fetch a single quiz."""
    response = _quizzes_table().get_item(
        Key={"documentId": document_id, "quizId": quiz_id}
    )
    return response.get("Item")


def list_quizzes(document_id: str) -> list[dict]:
    """Return all quizzes for a document, sorted by quizNumber."""
    response = _quizzes_table().query(
        KeyConditionExpression=Key("documentId").eq(document_id),
        ProjectionExpression="quizId, quizNumber, score, totalQuestions, createdAt",
    )
    quizzes = response.get("Items", [])
    quizzes.sort(key=lambda q: q.get("quizNumber", 0))
    return quizzes


def update_quiz_score(document_id: str, quiz_id: str, score: int) -> None:
    """Save the user's score for a quiz."""
    _quizzes_table().update_item(
        Key={"documentId": document_id, "quizId": quiz_id},
        UpdateExpression="SET score = :s",
        ExpressionAttributeValues={":s": score},
    )
