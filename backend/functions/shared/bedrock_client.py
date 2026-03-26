"""
AI model wrapper — supports Bedrock (Claude, Nova) and OpenRouter as fallback.
Frontend sends X-Model-Provider header to select the model.
"""
import json
import os
import urllib.request
import urllib.error
import boto3

_bedrock = {}

MODELS = {
    "claude": {
        "id": "anthropic.claude-haiku-4-5-20251001-v1:0",
        "global_id": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "type": "bedrock-anthropic",
        "label": "Claude Haiku 4.5 (Bedrock)",
    },
    "nova": {
        "id": "amazon.nova-micro-v1:0",
        "type": "bedrock-nova",
        "label": "Nova Micro (Bedrock)",
    },
    "nova-lite": {
        "id": "amazon.nova-lite-v1:0",
        "type": "bedrock-nova",
        "label": "Nova Lite (Bedrock)",
    },
    "openrouter": {
        "id": "minimax/minimax-m2.5:free",
        "type": "openrouter",
        "label": "MiniMax M2.5",
    },
    "openrouter-qwen": {
        "id": "qwen/qwen3-next-80b-a3b-instruct:free",
        "type": "openrouter",
        "label": "Qwen3 80B",
    },
    "openrouter-nemotron": {
        "id": "nvidia/nemotron-3-super-120b-a12b:free",
        "type": "openrouter",
        "label": "Nemotron 3 Super",
    },
    "openrouter-gpt120": {
        "id": "openai/gpt-oss-120b:free",
        "type": "openrouter",
        "label": "GPT-OSS 120B",
    },
    "openrouter-gpt20": {
        "id": "openai/gpt-oss-20b:free",
        "type": "openrouter",
        "label": "GPT-OSS 20B",
    },
    "openrouter-mistral": {
        "id": "mistralai/mistral-small-3.1-24b-instruct:free",
        "type": "openrouter",
        "label": "Mistral Small 3.1",
    },
    "openrouter-gemma12": {
        "id": "google/gemma-3-12b-it:free",
        "type": "openrouter",
        "label": "Gemma 3 12B",
    },
    "openrouter-gemma27": {
        "id": "google/gemma-3-27b-it:free",
        "type": "openrouter",
        "label": "Gemma 3 27B",
    },
    "openrouter-llama": {
        "id": "meta-llama/llama-3.3-70b-instruct:free",
        "type": "openrouter",
        "label": "Llama 3.3 70B",
    },
    "openrouter-auto": {
        "id": "openrouter/auto",
        "type": "openrouter",
        "label": "Auto Router",
    },
}

DEFAULT_PROVIDER = os.environ.get("DEFAULT_MODEL_PROVIDER", "openrouter-auto")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

_CHARS_PER_TOKEN = 4
MAX_INPUT_TOKENS = 8000


def _get_bedrock_client(region=None):
    r = region or os.environ.get("BEDROCK_REGION", "ap-southeast-1")
    if r not in _bedrock:
        _bedrock[r] = boto3.client("bedrock-runtime", region_name=r)
    return _bedrock[r]


def truncate_text(text: str, max_tokens: int = MAX_INPUT_TOKENS) -> str:
    max_chars = max_tokens * _CHARS_PER_TOKEN
    if len(text) > max_chars:
        return text[:max_chars] + "\n\n[ข้อความถูกตัดเพราะยาวเกินไป]"
    return text


def get_provider_from_event(event: dict) -> str:
    headers = event.get("headers") or {}
    provider = headers.get("x-model-provider") or headers.get("X-Model-Provider") or ""
    provider = provider.strip().lower()
    if provider in MODELS:
        return provider
    return DEFAULT_PROVIDER


# ─── Bedrock Anthropic ──────────────────────────────────────────────────────

def _invoke_bedrock_anthropic(model_id: str, prompt: str, max_tokens: int, system: str) -> str:
    client = _get_bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    response = client.invoke_model(
        modelId=model_id, contentType="application/json",
        accept="application/json", body=json.dumps(body),
    )
    result = json.loads(response["body"].read())
    return result["content"][0]["text"]


# ─── Bedrock Nova ───────────────────────────────────────────────────────────

def _invoke_bedrock_nova(model_id: str, prompt: str, max_tokens: int, system: str) -> str:
    client = _get_bedrock_client()
    body = {
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": max_tokens},
    }
    if system:
        body["system"] = [{"text": system}]
    response = client.invoke_model(
        modelId=model_id, contentType="application/json",
        accept="application/json", body=json.dumps(body),
    )
    result = json.loads(response["body"].read())
    return result["output"]["message"]["content"][0]["text"]


# ─── OpenRouter ─────────────────────────────────────────────────────────────

def _invoke_openrouter(model_id: str, prompt: str, max_tokens: int, system: str) -> str:
    api_key = OPENROUTER_API_KEY
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = json.dumps({
        "model": model_id,
        "max_tokens": max_tokens,
        "messages": messages,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://zage.study",
            "X-Title": "Zage AI Study Platform",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=55) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            msg = result["choices"][0]["message"]
            # Some models (reasoning) return content=null with reasoning in separate field
            content = msg.get("content") or ""
            if not content and msg.get("reasoning"):
                content = msg["reasoning"]
            if not content and msg.get("reasoning_details"):
                for rd in msg["reasoning_details"]:
                    if rd.get("text"):
                        content = rd["text"]
                        break
            if not content:
                raise RuntimeError("Model returned empty response")
            return content
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"OpenRouter {exc.code}: {body}") from exc


# ─── Unified interface ──────────────────────────────────────────────────────

def invoke_model(prompt: str, max_tokens: int = 1024, system: str = "", provider: str = "") -> str:
    p = provider or DEFAULT_PROVIDER
    model = MODELS.get(p, MODELS[DEFAULT_PROVIDER])

    try:
        if model["type"] == "bedrock-anthropic":
            return _invoke_bedrock_anthropic(model.get("global_id", model["id"]), prompt, max_tokens, system)
        elif model["type"] == "bedrock-nova":
            return _invoke_bedrock_nova(model["id"], prompt, max_tokens, system)
        elif model["type"] == "openrouter":
            return _invoke_openrouter(model["id"], prompt, max_tokens, system)
        else:
            raise RuntimeError(f"Unknown model type: {model['type']}")
    except Exception as exc:
        raise RuntimeError(f"AI call failed ({model['label']}): {exc}") from exc


def invoke_model_json(prompt: str, max_tokens: int = 1024, system: str = "", provider: str = "") -> object:
    raw = invoke_model(prompt, max_tokens=max_tokens, system=system, provider=provider)
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}\nRaw: {raw[:500]}") from exc


# Legacy aliases
def invoke_claude(prompt, max_tokens=1024, system=""):
    return invoke_model(prompt, max_tokens, system, "claude")

def invoke_nova(prompt, max_tokens=800, system=""):
    return invoke_model(prompt, max_tokens, system, "nova")

def invoke_claude_json(prompt, max_tokens=1024, system=""):
    return invoke_model_json(prompt, max_tokens, system, "claude")
