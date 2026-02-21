from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from typing_extensions import Annotated

# CONTRACT FREEZE NOTE:
# DTOs in this module are the canonical backend API contract for request payloads.
# Breaking field changes (rename/removal/type tightening) require explicit API versioning
# and a matching changelog entry in docs/data-contract-lock.md before release.

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


class MachineDTO(BaseModel):
    id: NonEmptyStr
    user_id: NonEmptyStr
    name: NonEmptyStr
    movement: NonEmptyStr
    equipment_type: Literal["machine", "freeweight", "bodyweight", "cable", "band", "other"]
    muscle_groups: list[NonEmptyStr] = Field(min_length=1)
    thumbnails: list[NonEmptyStr] = Field(default_factory=list)
    instruction_image: NonEmptyStr | None = None
    source: NonEmptyStr | None = None
    notes: str | None = None

    @field_validator("thumbnails", mode="after")
    @classmethod
    def validate_media_fields_for_equipment_type(cls, value: list[str], info):
        equipment_type = info.data.get("equipment_type")
        if equipment_type != "machine" and value:
            raise ValueError("thumbnails must be empty unless equipment_type is 'machine'")
        return value

    @field_validator("instruction_image", "source", mode="after")
    @classmethod
    def validate_nullable_media_fields_for_equipment_type(cls, value: str | None, info):
        equipment_type = info.data.get("equipment_type")
        if equipment_type != "machine" and value is not None:
            raise ValueError("instruction_image/source must be null unless equipment_type is 'machine'")
        return value


class SorenessReportEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    training_bucket_id: NonEmptyStr
    muscle_group: NonEmptyStr
    level: int = Field(ge=0, le=3)


class RecommendationRequest(BaseModel):
    # Canonical request payload (see docs/data-contract-lock.md).
    scope: RecommendationScope | None = None
    grouped_training: list[GroupedTrainingBucket] | None = None
    equipment: dict[str, MachineDTO] | None = None
    soreness_data: list[SorenessReportEntry] = Field(default_factory=list)
    scope_id: str | None = None

    # Backward compatibility for older clients
    current_session: dict[str, Any] | None = None
    past_sessions: list[dict[str, Any]] | None = None
    machines: dict[str, MachineDTO] | None = None


class WeeklyTrendJobRequest(BaseModel):
    user_id: NonEmptyStr | None = None
