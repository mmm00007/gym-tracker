"""
Gym Tracker API - Lightweight FastAPI backend.
Only handles LLM calls (Anthropic API) to keep the API key server-side.
All CRUD goes directly from frontend -> Supabase.
"""

import json
import logging
import time
from typing import Any, Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

from settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gym Tracker API")

settings = get_settings()
supabase_settings = settings.supabase

_jwks_client: Optional[PyJWKClient] = None
_jwks_client_url: Optional[str] = None
_last_jwks_refresh = 0.0
JWKS_REFRESH_SECONDS = 300

ROLLOUT_FLAGS = settings.feature_flags.rollout_flags

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.allow_all_origins else settings.allowed_origins,
    allow_credentials=False if settings.allow_all_origins else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_client_url, _last_jwks_refresh
    jwks_url = supabase_settings.resolved_jwks_url
    if not jwks_url:
        raise HTTPException(500, "SUPABASE_JWKS_URL or SUPABASE_URL must be configured")
    now = time.time()
    if (
        _jwks_client is None
        or _jwks_client_url != jwks_url
        or now - _last_jwks_refresh > JWKS_REFRESH_SECONDS
    ):
        _jwks_client = PyJWKClient(jwks_url)
        _jwks_client_url = jwks_url
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
        "verify_aud": bool(supabase_settings.jwt_audience),
        "verify_iss": bool(supabase_settings.resolved_jwt_issuer),
    }
    decode_kwargs = {
        "algorithms": ["HS256"],
        "options": decode_options,
    }
    if supabase_settings.jwt_audience:
        decode_kwargs["audience"] = supabase_settings.jwt_audience
    if supabase_settings.resolved_jwt_issuer:
        decode_kwargs["issuer"] = supabase_settings.resolved_jwt_issuer

    if supabase_settings.jwt_secret:
        payload = jwt.decode(token, supabase_settings.jwt_secret, **decode_kwargs)
    elif supabase_settings.resolved_jwks_url:
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
    if not settings.anthropic_api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "content-type": "application/json",
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": settings.anthropic_model,
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
    if not supabase_settings.url or not supabase_settings.service_role_key:
        raise HTTPException(500, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")
    return supabase_settings.url, supabase_settings.service_role_key


def is_supabase_admin_configured() -> bool:
    return bool(supabase_settings.url and supabase_settings.service_role_key)


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
    enrich_with_web_search: bool = False


@app.post("/api/identify-machine")
async def identify_machine(req: IdentifyRequest, user_id: str = Depends(get_current_user_id)):
    if not req.images or len(req.images) == 0:
        raise HTTPException(400, "At least one image required")
    if len(req.images) > 3:
        raise HTTPException(400, "Maximum 3 images")

    logger.debug("identify-machine request authorized for user_id=%s", user_id)

    base_prompt = """You are a gym equipment expert. Analyze these photos of a gym machine or exercise station.
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
}"""

    enriched_prompt = """You are a gym equipment expert. Analyze these photos of a gym machine or exercise station.
Use an enriched lookup approach (as if cross-checking common gym catalogs and web references) to infer likely machine family/model, aliases, and target muscles.
Identify the machine and the specific exercise/movement it's set up for.
Look for details like grip position, seat adjustment, cable angle, and foot/seat/chest-pad positioning.

Return ONLY valid JSON (no markdown, no backticks):
{
  "name": "short machine name",
  "exerciseType": "Push | Pull | Legs | Core",
  "movement": "specific movement name with variation",
  "muscleGroups": ["Primary", "Secondary"],
  "muscleProfile": {
    "primary": ["muscle groups"],
    "secondary": ["muscle groups"]
  },
  "variations": ["other exercises possible on this machine"],
  "aliases": ["common alternate names for this station"],
  "likelyModel": "optional likely machine family or model name",
  "defaultWeight": 20,
  "defaultReps": 10,
  "notes": "brief form tips including confidence caveats"
}"""

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
        "text": enriched_prompt if req.enrich_with_web_search else base_prompt,
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
    included_set_types: list[str] = Field(default_factory=lambda: ["working"])
    goals: list[str] = Field(default_factory=list)
    recommendations: Optional[str] = None

    @field_validator("included_set_types", "goals", mode="before")
    @classmethod
    def normalize_scope_lists(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("Must be an array of strings")
        normalized: list[str] = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if text and text not in normalized:
                normalized.append(text)
        return normalized

    @field_validator("included_set_types", mode="after")
    @classmethod
    def ensure_default_set_type(cls, value: list[str]) -> list[str]:
        return value or ["working"]


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
        "goals": [],
    }
    equipment = req.machines or req.equipment or {}
    return scope, grouped, equipment


@app.post("/api/recommendations")
async def get_recommendations(req: RecommendationRequest, user_id: str = Depends(get_current_user_id)):

    logger.debug("recommendations request authorized for user_id=%s", user_id)

    validated_scope_id: Optional[str] = None
    if req.scope_id:
        if is_supabase_admin_configured():
            scope_rows = await supabase_admin_request(
                "GET",
                "recommendation_scopes",
                params={
                    "id": f"eq.{req.scope_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id",
                    "limit": "1",
                },
            )
            if not scope_rows:
                logger.warning(
                    "Rejected recommendation request with invalid scope ownership: user_id=%s scope_id=%s",
                    user_id,
                    req.scope_id,
                )
                raise HTTPException(400, "Invalid scope_id")
            validated_scope_id = req.scope_id
        else:
            logger.warning(
                "Skipping scope validation because supabase admin credentials are not configured: user_id=%s scope_id=%s",
                user_id,
                req.scope_id,
            )

    scope, grouped_training, equipment = normalize_recommendation_request(req)
    trimmed_training = trim_history_to_token_budget(grouped_training, settings.max_history_tokens)

    soreness_ctx = ""
    if req.soreness_data:
        soreness_ctx = f"\n\nRECENT SORENESS REPORTS:\n{json.dumps(req.soreness_data, indent=2)}"

    goals = scope.get("goals", [])
    goals_json = json.dumps(goals, indent=2)

    prompt = f"""You are an expert personal trainer analyzing set-based training data.

ANALYSIS SCOPE:
{json.dumps(scope, indent=2)}

PRIORITY GOALS (rank recommendations to match these first):
{goals_json}

GROUPED TRAINING DATA ({len(trimmed_training)} buckets):
{json.dumps(trimmed_training, indent=2)}

EQUIPMENT CATALOG:
{json.dumps(equipment, indent=2)}{soreness_ctx}

Use the scope fields exactly as constraints. Prioritize explainable, evidence-based insights.
Treat scope.goals as explicit user priorities and optimize recommendation ranking/order to satisfy those goals first.
When trade-offs are required, call them out and explain how each suggestion serves the listed goals.
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

        report_persisted = True
        report_id: Optional[str] = None
        try:
            report_id = await persist_analysis_report(
                user_id=user_id,
                report_type="recommendation",
                scope_id=validated_scope_id,
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
        except HTTPException as exc:
            report_persisted = False
            logger.error(
                "Failed to persist recommendation report: user_id=%s scope_id=%s reason=%s",
                user_id,
                validated_scope_id,
                exc.detail,
            )
        except Exception as exc:
            report_persisted = False
            logger.exception(
                "Unexpected recommendation report persistence failure: user_id=%s scope_id=%s reason=%s",
                user_id,
                validated_scope_id,
                str(exc),
            )

        if validated_scope_id:
            response["scope_id"] = validated_scope_id
        if report_persisted and report_id:
            response["report_id"] = report_id
        elif not report_persisted:
            response.pop("report_id", None)
        response["report_persisted"] = report_persisted
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
    week_start_min = trend_points[0]["week_start"] if trend_points else None
    week_start_max = trend_points[-1]["week_start"] if trend_points else None

    evidence = []
    if len(trend_points) >= 2:
        latest = trend_points[-1]
        previous = trend_points[-2]
        evidence = [
            {
                "claim": "Latest week total sets changed versus prior week.",
                "metric": "total_sets",
                "period": f"{latest['week_start']} vs {previous['week_start']}",
                "delta": latest["total_sets"] - previous["total_sets"],
                "source": {
                    "grouping": "training_week",
                    "included_set_types": ["all"],
                    "sample_size": latest["total_sets"],
                    "sample_size_detail": {
                        "latest_week_sets": latest["total_sets"],
                        "prior_week_sets": previous["total_sets"],
                    },
                },
            },
            {
                "claim": "Latest week total reps changed versus prior week.",
                "metric": "total_reps",
                "period": f"{latest['week_start']} vs {previous['week_start']}",
                "delta": latest["total_reps"] - previous["total_reps"],
                "source": {
                    "grouping": "training_week",
                    "included_set_types": ["all"],
                    "sample_size": latest["total_sets"],
                    "sample_size_detail": {
                        "latest_week_sets": latest["total_sets"],
                        "prior_week_sets": previous["total_sets"],
                    },
                },
            },
            {
                "claim": "Latest week total volume changed versus prior week.",
                "metric": "total_volume",
                "period": f"{latest['week_start']} vs {previous['week_start']}",
                "delta": round(latest["total_volume"] - previous["total_volume"], 1),
                "source": {
                    "grouping": "training_week",
                    "included_set_types": ["all"],
                    "sample_size": latest["total_sets"],
                    "sample_size_detail": {
                        "latest_week_sets": latest["total_sets"],
                        "prior_week_sets": previous["total_sets"],
                    },
                },
            },
        ]
    elif len(trend_points) == 1:
        latest = trend_points[-1]
        evidence = [
            {
                "claim": "Only one week is currently available for trend comparison.",
                "metric": "weekly_sample_size",
                "period": latest["week_start"],
                "delta": 0,
                "source": {
                    "grouping": "training_week",
                    "included_set_types": ["all"],
                    "sample_size": latest["total_sets"],
                    "sample_size_detail": {
                        "latest_week_sets": latest["total_sets"],
                    },
                },
            }
        ]

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
        evidence=evidence,
        title="Weekly trends",
        summary=summary,
        metadata={
            "source": "api/jobs/generate-weekly-trends",
            "week_count": len(trend_points),
            "week_start_min": week_start_min,
            "week_start_max": week_start_max,
            "included_set_types": ["all"],
        },
    )

    return {"user_id": user_id, "report_id": report_id, "weeks": trend_points}


async def list_all_user_ids_with_sets(page_size: int = 1000) -> list[str]:
    user_ids: set[str] = set()
    offset = 0

    while True:
        rows = await supabase_admin_request(
            "GET",
            "sets",
            params={
                "select": "user_id",
                "user_id": "not.is.null",
                "order": "user_id.asc",
                "limit": str(page_size),
                "offset": str(offset),
            },
        )

        if not rows:
            break

        user_ids.update(str(row["user_id"]) for row in rows if row.get("user_id"))

        if len(rows) < page_size:
            break

        offset += page_size

    return sorted(user_ids)


@app.post("/api/jobs/generate-weekly-trends")
async def generate_weekly_trends(req: WeeklyTrendJobRequest, x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_shared_secret or x_cron_secret != settings.cron_shared_secret:
        raise HTTPException(401, "Unauthorized")

    user_ids: list[str] = []
    if req.user_id:
        user_ids = [req.user_id]
    else:
        user_ids = await list_all_user_ids_with_sets()

    if not user_ids:
        return {"ok": True, "processed_users": 0, "reports": []}

    reports = []
    for user_id in user_ids:
        reports.append(await build_weekly_trend_report(user_id))

    return {"ok": True, "processed_users": len(reports), "reports": reports}


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": settings.anthropic_model, "rollout_flags": ROLLOUT_FLAGS}


@app.get("/api/rollout-flags")
async def rollout_flags():
    return ROLLOUT_FLAGS
