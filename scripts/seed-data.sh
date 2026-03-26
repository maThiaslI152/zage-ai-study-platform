#!/usr/bin/env bash
# seed-data.sh — Insert sample DynamoDB records for local/dev testing.
# Creates a test user's documents, chats, and flashcards without uploading real files.
#
# Usage:
#   ./scripts/seed-data.sh                     # uses default table names
#   DOCUMENTS_TABLE=my-table ./scripts/seed-data.sh
#
# Prerequisites:
#   aws CLI configured (or LocalStack endpoint set via AWS_ENDPOINT_URL)
set -euo pipefail

AWS_REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"
DOCUMENTS_TABLE="${DOCUMENTS_TABLE:-zage-documents}"
CHATS_TABLE="${CHATS_TABLE:-zage-chats}"
FLASHCARDS_TABLE="${FLASHCARDS_TABLE:-zage-flashcards}"
DDB_ARGS=(--region "$AWS_REGION")

# If LocalStack, override endpoint
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
  DDB_ARGS+=(--endpoint-url "$AWS_ENDPOINT_URL")
  echo "Using endpoint: $AWS_ENDPOINT_URL"
fi

TEST_USER_ID="seed-user-00000000-0000-0000-0000-000000000001"
DOC1_ID="seed-doc-00000000-0000-0000-0000-000000000001"
DOC2_ID="seed-doc-00000000-0000-0000-0000-000000000002"
NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "==> Seeding DynamoDB tables for test user: $TEST_USER_ID"
echo "    Region: $AWS_REGION"
echo "    Documents table: $DOCUMENTS_TABLE"

# ─── Documents ─────────────────────────────────────────────────────────────

echo ""
echo "==> Inserting document 1 (status=ready)..."
aws dynamodb put-item "${DDB_ARGS[@]}" \
  --table-name "$DOCUMENTS_TABLE" \
  --item '{
    "userId":        {"S": "'"$TEST_USER_ID"'"},
    "documentId":    {"S": "'"$DOC1_ID"'"},
    "fileName":      {"S": "lecture-notes-chapter5.pdf"},
    "fileType":      {"S": "pdf"},
    "s3Key":         {"S": "uploads/'"$TEST_USER_ID"'/'"$DOC1_ID"'/lecture-notes-chapter5.pdf"},
    "status":        {"S": "ready"},
    "hasSummary":    {"BOOL": true},
    "extractedText": {"S": "Chapter 5: Tree Data Structures\n\nA Binary Search Tree (BST) is a tree data structure where every node satisfies: left child < parent < right child. This property enables efficient O(log n) search operations when the tree is balanced.\n\nAVL Trees are self-balancing BSTs that maintain a balance factor of at most ±1 for every node. After each insert or delete, rotations are performed to restore balance.\n\nB-Trees are designed for disk-based storage systems. Each node can have multiple children, keeping the tree height low and minimizing disk I/O operations."},
    "summary":       {"S": "Chapter 5 covers tree data structures including BST, AVL, and B-Tree with their time complexities."},
    "keyPoints":     {"L": [{"S": "BST guarantees O(log n) search when balanced"}, {"S": "AVL Tree maintains balance factor ±1 via rotations"}, {"S": "B-Tree is optimized for disk I/O"}]},
    "createdAt":     {"S": "'"$NOW"'"},
    "updatedAt":     {"S": "'"$NOW"'"}
  }'

echo "==> Inserting document 2 (status=processing)..."
aws dynamodb put-item "${DDB_ARGS[@]}" \
  --table-name "$DOCUMENTS_TABLE" \
  --item '{
    "userId":     {"S": "'"$TEST_USER_ID"'"},
    "documentId": {"S": "'"$DOC2_ID"'"},
    "fileName":   {"S": "midterm-review.pdf"},
    "fileType":   {"S": "pdf"},
    "s3Key":      {"S": "uploads/'"$TEST_USER_ID"'/'"$DOC2_ID"'/midterm-review.pdf"},
    "status":     {"S": "processing"},
    "hasSummary": {"BOOL": false},
    "createdAt":  {"S": "'"$NOW"'"},
    "updatedAt":  {"S": "'"$NOW"'"}
  }'

# ─── Chat messages for doc1 ──────────────────────────────────────────────────

echo ""
echo "==> Inserting sample chat messages for doc1..."
aws dynamodb put-item "${DDB_ARGS[@]}" \
  --table-name "$CHATS_TABLE" \
  --item '{
    "documentId": {"S": "'"$DOC1_ID"'"},
    "timestamp":  {"S": "2025-03-20T10:05:00Z#aabbccdd"},
    "userId":     {"S": "'"$TEST_USER_ID"'"},
    "role":       {"S": "user"},
    "content":    {"S": "AVL Tree ต่างจาก BST ธรรมดาอย่างไร?"}
  }'

aws dynamodb put-item "${DDB_ARGS[@]}" \
  --table-name "$CHATS_TABLE" \
  --item '{
    "documentId": {"S": "'"$DOC1_ID"'"},
    "timestamp":  {"S": "2025-03-20T10:05:05Z#eeff0011"},
    "userId":     {"S": "'"$TEST_USER_ID"'"},
    "role":       {"S": "assistant"},
    "content":    {"S": "AVL Tree เป็น BST ที่รับประกันความสมดุล โดยรักษา Balance Factor ±1 ผ่าน Rotation หลังทุก Insert/Delete ทำให้ O(log n) เสมอ"}
  }'

# ─── Flashcards for doc1 ────────────────────────────────────────────────────

echo ""
echo "==> Inserting sample flashcards for doc1..."
for i in 1 2 3; do
  CARD_ID="seed-card-$(printf '%032d' "$i")"
  case $i in
    1) FRONT="BST คืออะไร?"; BACK="Tree ที่ left < parent < right รับประกัน O(log n) เมื่อสมดุล";;
    2) FRONT="Balance Factor คือ?"; BACK="Height(left) − Height(right) ต้องไม่เกิน ±1 ใน AVL Tree";;
    3) FRONT="B-Tree เหมาะกับอะไร?"; BACK="ระบบฐานข้อมูลบน Disk เพราะ Node มีลูกหลายตัว ลด I/O";;
  esac
  aws dynamodb put-item "${DDB_ARGS[@]}" \
    --table-name "$FLASHCARDS_TABLE" \
    --item '{
      "documentId": {"S": "'"$DOC1_ID"'"},
      "cardId":     {"S": "'"$CARD_ID"'"},
      "userId":     {"S": "'"$TEST_USER_ID"'"},
      "front":      {"S": "'"$FRONT"'"},
      "back":       {"S": "'"$BACK"'"},
      "createdAt":  {"S": "'"$NOW"'"}
    }'
done

echo ""
echo "==> Seed complete!"
echo ""
echo "    Test userId: $TEST_USER_ID"
echo "    Doc1 (ready):      $DOC1_ID"
echo "    Doc2 (processing): $DOC2_ID"
echo ""
echo "    Query doc1:"
echo "    aws dynamodb get-item --table-name $DOCUMENTS_TABLE \\"
echo "      --key '{\"userId\":{\"S\":\"$TEST_USER_ID\"},\"documentId\":{\"S\":\"$DOC1_ID\"}}'"
