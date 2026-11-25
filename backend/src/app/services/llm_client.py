import json
import logging
from typing import Tuple, Dict, Optional, Any
import httpx
from src.app.core.config import settings

logger = logging.getLogger(__name__)


def build_llm_config(user_settings: Any = None) -> Dict[str, Optional[str]]:
    """Build a thread-safe per-request/per-user LLM config without mutating global settings."""
    if not user_settings:
        return {
            "api_key": settings.OPENAI_API_KEY or settings.GEMINI_API_KEY,
            "provider": None,
            "model": None,
            "custom_api_base": None,
        }
    return {
        "api_key": getattr(user_settings, "openai_api_key", None) or settings.OPENAI_API_KEY or settings.GEMINI_API_KEY,
        "provider": getattr(user_settings, "llm_provider", None),
        "model": getattr(user_settings, "llm_model", None),
        "custom_api_base": getattr(user_settings, "custom_api_base", None),
    }


def detect_llm_provider(api_key: Optional[str]) -> str:
    """Detect LLM provider based on API key prefix pattern."""
    if not api_key:
        return "openai"

    k = api_key.strip()
    if k.startswith("gsk_"):
        return "groq"
    if k.startswith("sk-or-"):
        return "openrouter"
    if k.startswith("AIzaSy") or k.startswith("AQ."):
        return "gemini"
    if k.startswith("sk-ant-"):
        return "anthropic"
    if k.startswith("sk-") or k.startswith("sk-proj-"):
        return "openai"
    return "openai"


def get_llm_headers_and_url(
    api_key: Optional[str] = None,
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
    custom_api_base: Optional[str] = None,
) -> Tuple[Dict[str, str], str, str, str]:
    """Return (headers, endpoint_url, model_name, resolved_provider) for any supported LLM provider."""
    key = api_key or settings.OPENAI_API_KEY or settings.GEMINI_API_KEY or ""
    detected_provider = provider or detect_llm_provider(key)

    if detected_provider == "ollama" or custom_api_base:
        base_url = (custom_api_base or "http://localhost:11434/v1").rstrip("/")
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {key or 'ollama-free'}",
            "Content-Type": "application/json",
        }
        model = model_name or "llama3"
        return headers, url, model, "ollama"

    # Override provider if key prefix clearly identifies Gemini or Groq/OpenRouter
    if key:
        inferred = detect_llm_provider(key)
        if inferred in ("gemini", "groq", "openrouter") and not provider:
            detected_provider = inferred
        elif key.startswith(("AIzaSy", "AQ.")):
            detected_provider = "gemini"

    if detected_provider == "openrouter":
        headers = {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://github.com/alfa546/Auto-Apply-AI",
            "X-Title": "Auto-Apply AI",
            "Content-Type": "application/json",
        }
        url = "https://openrouter.ai/api/v1/chat/completions"
        model = model_name or "meta-llama/llama-3.1-8b-instruct:free"
        return headers, url, model, "openrouter"

    if detected_provider == "groq":
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        url = "https://api.groq.com/openai/v1/chat/completions"
        model = model_name or "llama-3.1-70b-versatile"
        return headers, url, model, "groq"

    if detected_provider == "gemini":
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        model = model_name or settings.GEMINI_MODEL or "gemini-1.5-flash"
        return headers, url, model, "gemini"

    if detected_provider == "deepseek":
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        url = "https://api.deepseek.com/v1/chat/completions"
        model = model_name or "deepseek-chat"
        return headers, url, model, "deepseek"

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    url = "https://api.openai.com/v1/chat/completions"
    model = model_name or settings.OPENAI_MODEL or "gpt-4o-mini"
    return headers, url, model, "openai"


def is_llm_configured(
    api_key: Optional[str] = None,
    provider: Optional[str] = None,
    custom_api_base: Optional[str] = None,
) -> bool:
    """Return True if a usable LLM credential or local endpoint is configured."""
    if provider == "ollama" or custom_api_base:
        return True
    key = api_key or settings.OPENAI_API_KEY or settings.GEMINI_API_KEY
    return bool(key and key.strip() and "••••••••" not in key)


def extract_chat_content(response_json: dict) -> str:
    """Extract text content across OpenAI-compatible and Gemini response formats."""
    if "choices" in response_json and response_json["choices"]:
        return (response_json["choices"][0].get("message", {}).get("content") or "").strip()
    if "candidates" in response_json and response_json["candidates"]:
        parts = response_json["candidates"][0].get("content", {}).get("parts", [])
        if parts:
            return (parts[0].get("text") or "").strip()
    if "content" in response_json and isinstance(response_json["content"], list) and response_json["content"]:
        return (response_json["content"][0].get("text") or "").strip()
    return ""


def strip_json_fences(raw_text: str) -> str:
    """Remove optional markdown JSON fences from LLM text."""
    text = (raw_text or "").strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def call_llm_chat(
    system_prompt: str,
    user_prompt: str,
    llm_config: Optional[Dict[str, Optional[str]]] = None,
    temperature: float = 0.2,
    timeout: float = 30.0,
) -> str:
    """Synchronous helper to invoke the configured LLM chat completion endpoint."""
    cfg = llm_config or build_llm_config()
    if not is_llm_configured(
        api_key=cfg.get("api_key"),
        provider=cfg.get("provider"),
        custom_api_base=cfg.get("custom_api_base"),
    ):
        raise RuntimeError("No LLM configured")

    headers, url, model, _ = get_llm_headers_and_url(
        api_key=cfg.get("api_key"),
        provider=cfg.get("provider"),
        model_name=cfg.get("model"),
        custom_api_base=cfg.get("custom_api_base"),
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            content = extract_chat_content(response.json())
            if not content:
                raise RuntimeError("LLM returned empty content")
            return content
        raise RuntimeError(f"LLM API returned {response.status_code}: {response.text[:300]}")


def call_llm_json(
    system_prompt: str,
    user_prompt: str,
    llm_config: Optional[Dict[str, Optional[str]]] = None,
    timeout: float = 30.0,
) -> dict:
    """Invoke LLM chat completion and parse the JSON object response."""
    raw = call_llm_chat(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        llm_config=llm_config,
        temperature=0.1,
        timeout=timeout,
    )
    cleaned = strip_json_fences(raw)
    return json.loads(cleaned)
