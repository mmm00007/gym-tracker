"""
Gym Tracker API - Lightweight FastAPI backend.
Only handles LLM calls (Anthropic API) to keep the API key server-side.
All CRUD goes directly from frontend -> Supabase.
"""

import os
import json
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gym Tracker API")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
raw_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in raw_allowed_origins.split(",") if origin.strip()]
ALLOW_ALL_ORIGINS = len(ALLOWED_ORIGINS) == 1 and ALLOWED_ORIGINS[0] == "*"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
MAX_HISTORY_TOKENS = 4000

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOW_ALL_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=False if ALLOW_ALL_ORIGINS else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_auth(authorization: Optional[str]) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        return False
    return True


async def call_anthropic(messages: list, max_tokens: int = 1000) -> str:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "content-type": "application/json",
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": max_tokens,
                "messages": messages,
            },
        )
    if resp.status_code != 200:
        logger.error(f"Anthropic API error: {resp.status_code} {resp.text}")
        raise HTTPException(502, "LLM service error")
    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []))
    return text


def parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


# --- Identify Machine ---

class IdentifyRequest(BaseModel):
    images: list[dict]


@app.post("/api/identify-machine")
async def identify_machine(req: IdentifyRequest, authorization: str = Header(None)):
    if not verify_auth(authorization):
        raise HTTPException(401, "Unauthorized")
    if not req.images or len(req.images) == 0:
        raise HTTPException(400, "At least one image required")
    if len(req.images) > 3:
        raise HTTPException(400, "Maximum 3 images")

    content = []
    for img in req.images:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img.get("media_type", "image/jpeg"),
                "data": img["data"],
            },
        })
    content.append({
        "type": "text",
        "text": """You are a gym equipment expert. Analyze these photos of a gym machine or exercise station.
Identify the machine and the specific exercise/movement it's set up for.
Look for details like grip position, seat adjustment, cable angle, etc.

Return ONLY valid JSON (no markdown, no backticks):
{
  "name": "short machine name",
  "exerciseType": "Push | Pull | Legs | Core",
  "movement": "specific movement name with variation",
  "muscleGroups": ["Primary", "Secondary"],
  "variations": ["other exercises possible on this machine"],
  "defaultWeight": 20,
  "defaultReps": 10,
  "notes": "brief form tips"
}""",
    })

    try:
        text = await call_anthropic([{"role": "user", "content": content}])
        return parse_json_response(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "Failed to parse LLM response")


# --- Recommendations ---

class SessionData(BaseModel):
    current_session: dict
    past_sessions: list[dict]
    machines: dict
    soreness_data: list[dict] = []


def trim_history_to_token_budget(sessions: list[dict], budget: int) -> list[dict]:
    result = []
    used = 0
    for s in reversed(sessions):
        text = json.dumps(s)
        est_tokens = len(text) // 4
        if used + est_tokens > budget:
            break
        result.insert(0, s)
        used += est_tokens
    return result


@app.post("/api/recommendations")
async def get_recommendations(req: SessionData, authorization: str = Header(None)):
    if not verify_auth(authorization):
        raise HTTPException(401, "Unauthorized")

    trimmed = trim_history_to_token_budget(req.past_sessions, MAX_HISTORY_TOKENS)
    soreness_ctx = ""
    if req.soreness_data:
        soreness_ctx = f"\n\nRECENT SORENESS REPORTS:\n{json.dumps(req.soreness_data, indent=2)}"

    prompt = f"""You are an expert personal trainer analyzing workout data.

CURRENT SESSION:
{json.dumps(req.current_session, indent=2)}

PAST SESSIONS ({len(trimmed)} of {len(req.past_sessions)} total):
{json.dumps(trimmed, indent=2)}

MACHINES:
{json.dumps(req.machines, indent=2)}{soreness_ctx}

Consider volume progression, muscle balance, rest patterns, soreness feedback, and exercise variety.

Return ONLY valid JSON:
{{
  "summary": "2-3 sentence session summary",
  "highlights": ["2-3 positives"],
  "suggestions": ["2-3 actionable improvements"],
  "nextSession": "what to focus on next",
  "progressNotes": "notable trends in strength/volume"
}}"""

    try:
        text = await call_anthropic([{"role": "user", "content": prompt}])
        return parse_json_response(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "Failed to parse LLM response")


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": ANTHROPIC_MODEL}
