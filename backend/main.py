"""
Gym Tracker API - Lightweight FastAPI backend.
Only handles LLM calls (Anthropic API) to keep the API key server-side.
All CRUD goes directly from frontend -> Supabase.
"""

import os
import json
import logging
import time
from typing import Any, Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gym Tracker API")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
raw_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in raw_allowed_origins.split(",") if origin.strip()]
ALLOW_ALL_ORIGINS = len(ALLOWED_ORIGINS) == 1 and ALLOWED_ORIGINS[0] == "*"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
MAX_HISTORY_TOKENS = 4000
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
SUPABASE_JWT_AUDIENCE = os.environ.get("SUPABASE_JWT_AUDIENCE")
SUPABASE_JWT_ISSUER = os.environ.get("SUPABASE_JWT_ISSUER") or (
    f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else None
)
SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWKS_URL") or (
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None
)
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
CRON_SHARED_SECRET = os.environ.get("CRON_SHARED_SECRET")

_jwks_client: Optional[PyJWKClient] = None
_jwks_client_url: Optional[str] = None
_last_jwks_refresh = 0.0
JWKS_REFRESH_SECONDS = 300


def read_bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    logger.warning("Invalid boolean value for %s=%r; falling back to %s", name, raw, default)
    return default


ROLLOUT_FLAGS = {
    "setCentricLogging": read_bool_env("SET_CENTRIC_LOGGING", True),
    "libraryScreenEnabled": read_bool_env("LIBRARY_SCREEN_ENABLED", True),
    "analysisOnDemandOnly": read_bool_env("ANALYSIS_ON_DEMAND_ONLY", True),
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOW_ALL_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=False if ALLOW_ALL_ORIGINS else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_client_url, _last_jwks_refresh
    if not SUPABASE_JWKS_URL:
        raise HTTPException(500, "SUPABASE_JWKS_URL or SUPABASE_URL must be configured")
    now = time.time()
    if (
        _jwks_client is None
        or _jwks_client_url != SUPABASE_JWKS_URL
        or now - _last_jwks_refresh > JWKS_REFRESH_SECONDS
    ):
        _jwks_client = PyJWKClient(SUPABASE_JWKS_URL)
        _jwks_client_url = SUPABASE_JWKS_URL
        _last_jwks_refresh = now
    return _jwks_client


def verify_auth(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Unauthorized")

    decode_options = {
        "require": ["exp"],
        "verify_signature": True,
        "verify_aud": bool(SUPABASE_JWT_AUDIENCE),
        "verify_iss": bool(SUPABASE_JWT_ISSUER),
    }
    decode_kwargs = {
        "algorithms": ["HS256"],
        "options": decode_options,
    }
    if SUPABASE_JWT_AUDIENCE:
        decode_kwargs["audience"] = SUPABASE_JWT_AUDIENCE
    if SUPABASE_JWT_ISSUER:
        decode_kwargs["issuer"] = SUPABASE_JWT_ISSUER

    if SUPABASE_JWT_SECRET:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, **decode_kwargs)
    elif SUPABASE_JWKS_URL:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        decode_kwargs["algorithms"] = ["RS256", "ES256"]
        payload = jwt.decode(
            token,
            signing_key.key,
            **decode_kwargs,
        )
    else:
        logger.warning(
            "JWT signature verification is disabled because neither SUPABASE_JWT_SECRET "
            "nor SUPABASE_JWKS_URL is configured"
        )
        payload = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_exp": True,
                "verify_aud": False,
                "verify_iss": False,
            },
            algorithms=["HS256", "RS256", "ES256"],
        )

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    return str(user_id)


def get_current_user_id(request: Request, authorization: str = Header(None)) -> str:
    try:
        user_id = verify_auth(authorization)
    except HTTPException:
        raise
    except (InvalidTokenError, PyJWKClientError, ValueError):
        raise HTTPException(401, "Unauthorized")
    request.state.user_id = user_id
    return user_id


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


def require_supabase_admin() -> tuple[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(500, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")
    return SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


async def supabase_admin_request(method: str, path: str, payload: Optional[Any] = None, params: Optional[dict] = None) -> Any:
    base_url, service_key = require_supabase_admin()
    url = f"{base_url}/rest/v1/{path.lstrip('/')}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(method, url, headers=headers, json=payload, params=params)
    if response.status_code >= 400:
        logger.error("Supabase admin request failed: %s %s -> %s %s", method, path, response.status_code, response.text)
        raise HTTPException(502, "Database persistence error")
    if not response.text:
        return None
    return response.json()


def parse_json_response(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


async def persist_analysis_report(
    user_id: str,
    report_type: str,
    payload: dict,
    evidence: Any,
    scope_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    title: Optional[str] = None,
    summary: Optional[str] = None,
) -> Optional[str]:
    report_row = {
        "user_id": user_id,
        "report_type": report_type,
        "recommendation_scope_id": scope_id,
        "status": "ready",
        "title": title,
        "summary": summary,
        "payload": payload or {},
        "evidence": evidence if isinstance(evidence, list) else [],
        "metadata": metadata or {},
    }
    rows = await supabase_admin_request(
        "POST",
        "analysis_reports",
        payload=[report_row],
        params={"select": "id"},
    )
    if isinstance(rows, list) and rows:
        return rows[0].get("id")
    return None


# --- Identify Machine ---

class IdentifyRequest(BaseModel):
    images: list[dict]


@app.post("/api/identify-machine")
async def identify_machine(req: IdentifyRequest, user_id: str = Depends(get_current_user_id)):
    if not req.images or len(req.images) == 0:
        raise HTTPException(400, "At least one image required")
    if len(req.images) > 3:
        raise HTTPException(400, "Maximum 3 images")

    logger.debug("identify-machine request authorized for user_id=%s", user_id)

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

class RecommendationScope(BaseModel):
    grouping: str = "training_day"
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    included_set_types: list[str] = ["working"]
    recommendations: Optional[str] = None


class RecommendationRequest(BaseModel):
    # Phase 1 canonical payload
    scope: Optional[RecommendationScope] = None
    grouped_training: Optional[list[dict]] = None
    equipment: Optional[dict] = None
    soreness_data: list[dict] = []
    scope_id: Optional[str] = None

    # Backward compatibility for older clients
    current_session: Optional[dict] = None
    past_sessions: Optional[list[dict]] = None
    machines: Optional[dict] = None


def trim_history_to_token_budget(items: list[dict], budget: int) -> list[dict]:
    result = []
    used = 0
    for item in reversed(items):
        text = json.dumps(item)
        est_tokens = len(text) // 4
        if used + est_tokens > budget:
            break
        result.insert(0, item)
        used += est_tokens
    return result


def normalize_recommendation_request(req: RecommendationRequest) -> tuple[dict, list[dict], dict]:
    if req.scope and req.grouped_training is not None:
        scope = req.scope.model_dump()
        grouped_training = req.grouped_training
        equipment = req.equipment or {}
        return scope, grouped_training, equipment

    # Backward-compatible transformation from session payloads.
    past_sessions = req.past_sessions or []
    current_session = req.current_session or {}
    grouped = [
        {
            "training_bucket_id": "session:current",
            "training_date": current_session.get("started_at", "unknown")[:10],
            "sets": current_session.get("sets", []),
        },
        *[
            {
                "training_bucket_id": f"session:{s.get('started_at', '')}",
                "training_date": s.get("started_at", "unknown")[:10],
                "sets": s.get("sets", []),
            }
            for s in past_sessions
        ],
    ]
    scope = {
        "grouping": "training_day",
        "date_start": None,
        "date_end": None,
        "included_set_types": ["working"],
    }
    equipment = req.machines or req.equipment or {}
    return scope, grouped, equipment


@app.post("/api/recommendations")
async def get_recommendations(req: RecommendationRequest, user_id: str = Depends(get_current_user_id)):

    logger.debug("recommendations request authorized for user_id=%s", user_id)

    scope, grouped_training, equipment = normalize_recommendation_request(req)
    trimmed_training = trim_history_to_token_budget(grouped_training, MAX_HISTORY_TOKENS)

    soreness_ctx = ""
    if req.soreness_data:
        soreness_ctx = f"\n\nRECENT SORENESS REPORTS:\n{json.dumps(req.soreness_data, indent=2)}"

    prompt = f"""You are an expert personal trainer analyzing set-based training data.

ANALYSIS SCOPE:
{json.dumps(scope, indent=2)}

GROUPED TRAINING DATA ({len(trimmed_training)} buckets):
{json.dumps(trimmed_training, indent=2)}

EQUIPMENT CATALOG:
{json.dumps(equipment, indent=2)}{soreness_ctx}

Use the scope fields exactly as constraints. Prioritize explainable, evidence-based insights.
Consider volume progression, muscle balance, rest patterns, soreness feedback, and exercise variety.
Do not infer set duration if duration_seconds is missing.

Return ONLY valid JSON:
{{
  "summary": "2-3 sentence summary",
  "highlights": ["2-3 positives"],
  "suggestions": ["2-3 actionable improvements"],
  "nextSession": "what to focus on next",
  "progressNotes": "notable trends in strength/volume",
  "evidence": [
    {{
      "claim": "short claim",
      "metric": "metric_name",
      "period": "scope-aligned period",
      "delta": 0.0,
      "source": {{
        "grouping": "training_day|cluster",
        "included_set_types": ["working"],
        "sample_size": 0
      }}
    }}
  ]
}}"""

    try:
        text = await call_anthropic([{"role": "user", "content": prompt}])
        response = parse_json_response(text)
        if not isinstance(response, dict):
            raise HTTPException(502, "LLM response must be a JSON object")

        report_id = await persist_analysis_report(
            user_id=user_id,
            report_type="recommendation",
            scope_id=req.scope_id,
            payload=response,
            evidence=response.get("evidence", []),
            title="On-demand recommendation",
            summary=response.get("summary"),
            metadata={
                "grouping": scope.get("grouping"),
                "included_set_types": scope.get("included_set_types", []),
                "source": "api/recommendations",
            },
        )

        if req.scope_id:
            response["scope_id"] = req.scope_id
        if report_id:
            response["report_id"] = report_id
        return response
    except json.JSONDecodeError:
        raise HTTPException(502, "Failed to parse LLM response")


class WeeklyTrendJobRequest(BaseModel):
    user_id: Optional[str] = None


def _bucket_week_start(training_date: str) -> Optional[str]:
    if not training_date:
        return None
    try:
        from datetime import date, timedelta

        date_obj = date.fromisoformat(training_date)
        week_start = date_obj - timedelta(days=date_obj.weekday())
        return week_start.isoformat()
    except ValueError:
        return None


async def build_weekly_trend_report(user_id: str) -> dict:
    set_rows = await supabase_admin_request(
        "GET",
        "sets",
        params={
            "user_id": f"eq.{user_id}",
            "select": "training_date,reps,weight,set_type",
            "order": "training_date.desc",
            "limit": "800",
        },
    )

    weekly = {}
    for row in set_rows or []:
        week_start = _bucket_week_start(row.get("training_date"))
        if not week_start:
            continue
        item = weekly.setdefault(week_start, {"week_start": week_start, "total_sets": 0, "total_reps": 0, "total_volume": 0.0})
        item["total_sets"] += 1
        item["total_reps"] += int(row.get("reps") or 0)
        item["total_volume"] += float(row.get("weight") or 0) * float(row.get("reps") or 0)

    trend_points = [weekly[key] for key in sorted(weekly.keys())][-8:]
    summary = "No weekly trends available yet."
    if trend_points:
        latest = trend_points[-1]
        summary = (
            f"Week of {latest['week_start']}: {latest['total_sets']} sets, "
            f"{latest['total_reps']} reps, {round(latest['total_volume'], 1)} volume."
        )

    report_id = await persist_analysis_report(
        user_id=user_id,
        report_type="weekly_trend",
        payload={"weeks": trend_points},
        evidence=[],
        title="Weekly trends",
        summary=summary,
        metadata={"source": "api/jobs/generate-weekly-trends", "week_count": len(trend_points)},
    )

    return {"user_id": user_id, "report_id": report_id, "weeks": trend_points}


@app.post("/api/jobs/generate-weekly-trends")
async def generate_weekly_trends(req: WeeklyTrendJobRequest, x_cron_secret: Optional[str] = Header(None)):
    if not CRON_SHARED_SECRET or x_cron_secret != CRON_SHARED_SECRET:
        raise HTTPException(401, "Unauthorized")

    user_ids: list[str] = []
    if req.user_id:
        user_ids = [req.user_id]
    else:
        rows = await supabase_admin_request(
            "GET",
            "sets",
            params={
                "select": "user_id",
                "order": "logged_at.desc",
                "limit": "5000",
            },
        )
        user_ids = sorted({row.get("user_id") for row in (rows or []) if row.get("user_id")})

    if not user_ids:
        return {"ok": True, "processed_users": 0, "reports": []}

    reports = []
    for user_id in user_ids:
        reports.append(await build_weekly_trend_report(user_id))

    return {"ok": True, "processed_users": len(reports), "reports": reports}


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": ANTHROPIC_MODEL, "rollout_flags": ROLLOUT_FLAGS}


@app.get("/api/rollout-flags")
async def rollout_flags():
    return ROLLOUT_FLAGS
