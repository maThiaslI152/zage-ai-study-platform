"""POST /debug/reset-quota — Reset daily AI usage counter for the authenticated user."""
import json
import os
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key
from shared.auth import get_user_id

_dynamodb = None

def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-southeast-1"))
    return _dynamodb.Table(os.environ["DOCUMENTS_TABLE"])

def handler(event, context):
    try:
        user_id = get_user_id(event)
    except ValueError as exc:
        return {"statusCode": 401, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"error": str(exc)})}

    table = _get_table()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sk = f"USAGE#{today}"

    try:
        table.delete_item(Key={"userId": user_id, "documentId": sk})
    except Exception:
        pass

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Model-Provider"},
        "body": json.dumps({"reset": True, "date": today}),
    }
