from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from typing_extensions import Annotated


NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class RecommendationGrouping(str, Enum):
    TRAINING_DAY = "training_day"
    CLUSTER = "cluster"
    TRAINING_WEEK = "training_week"


class IdentifyImage(BaseModel):
    data: NonEmptyStr
    media_type: str = "image/jpeg"


class IdentifyRequest(BaseModel):
    images: list[IdentifyImage] = Field(min_length=1, max_length=3)
    enrich_with_web_search: bool = False


class RecommendationScope(BaseModel):
    grouping: RecommendationGrouping = RecommendationGrouping.TRAINING_DAY
    date_start: str | None = None
    date_end: str | None = None
    included_set_types: list[NonEmptyStr] = Field(default_factory=lambda: ["working"])
    goals: list[NonEmptyStr] = Field(default_factory=list)
    recommendations: str | None = None

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


class GroupedTrainingBucket(BaseModel):
    model_config = ConfigDict(extra="allow")


class SorenessReportEntry(BaseModel):
    model_config = ConfigDict(extra="allow")


class RecommendationRequest(BaseModel):
    # Phase 1 canonical payload
    scope: RecommendationScope | None = None
    grouped_training: list[GroupedTrainingBucket] | None = None
    equipment: dict[str, Any] | None = None
    soreness_data: list[SorenessReportEntry] = Field(default_factory=list)
    scope_id: str | None = None

    # Backward compatibility for older clients
    current_session: dict[str, Any] | None = None
    past_sessions: list[dict[str, Any]] | None = None
    machines: dict[str, Any] | None = None


class WeeklyTrendJobRequest(BaseModel):
    user_id: NonEmptyStr | None = None
