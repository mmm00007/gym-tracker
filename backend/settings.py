from functools import lru_cache
from typing import Annotated

import logging

from pydantic import BaseModel, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


logger = logging.getLogger(__name__)


class SupabaseSettings(BaseModel):
    url: str = ""
    jwt_secret: str | None = None
    jwt_audience: str | None = None
    jwt_issuer: str | None = None
    jwks_url: str | None = None
    service_role_key: str | None = None

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, value: str | None) -> str:
        return (value or "").rstrip("/")

    @property
    def resolved_jwt_issuer(self) -> str | None:
        if self.jwt_issuer:
            return self.jwt_issuer
        return f"{self.url}/auth/v1" if self.url else None

    @property
    def resolved_jwks_url(self) -> str | None:
        if self.jwks_url:
            return self.jwks_url
        return f"{self.url}/auth/v1/.well-known/jwks.json" if self.url else None


class FeatureFlagSettings(BaseModel):
    """Rollout flags sourced from:

    SET_CENTRIC_LOGGING, LIBRARY_SCREEN_ENABLED, ANALYSIS_ON_DEMAND_ONLY,
    PLANS_ENABLED, FAVORITES_ORDERING_ENABLED, HOME_DASHBOARD_ENABLED,
    MACHINE_RATING_ENABLED, PINNED_FAVORITES_ENABLED,
    MACHINE_AUTOFILL_ENABLED, WEIGHTED_MUSCLE_PROFILE_WORKLOAD_ENABLED,
    FIXED_OPTION_MACHINE_TAXONOMY_ENABLED.
    """

    set_centric_logging: bool = True
    library_screen_enabled: bool = True
    analysis_on_demand_only: bool = True
    plans_enabled: bool = True
    favorites_ordering_enabled: bool = True
    home_dashboard_enabled: bool = True
    machine_rating_enabled: bool = True
    pinned_favorites_enabled: bool = True
    machine_autofill_enabled: bool = True
    weighted_muscle_profile_workload_enabled: bool = True
    fixed_option_machine_taxonomy_enabled: bool = True

    @property
    def rollout_flags(self) -> dict[str, bool]:
        return {
            "setCentricLogging": self.set_centric_logging,
            "libraryScreenEnabled": self.library_screen_enabled,
            "analysisOnDemandOnly": self.analysis_on_demand_only,
            "plansEnabled": self.plans_enabled,
            "favoritesOrderingEnabled": self.favorites_ordering_enabled,
            "homeDashboardEnabled": self.home_dashboard_enabled,
            "machineRatingEnabled": self.machine_rating_enabled,
            "pinnedFavoritesEnabled": self.pinned_favorites_enabled,
            "machineAutofillEnabled": self.machine_autofill_enabled,
            "weightedMuscleProfileWorkloadEnabled": self.weighted_muscle_profile_workload_enabled,
            "fixedOptionMachineTaxonomyEnabled": self.fixed_option_machine_taxonomy_enabled,
        }


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"], alias="ALLOWED_ORIGINS"
    )
    anthropic_model: str = Field(default="claude-sonnet-4-20250514", alias="ANTHROPIC_MODEL")
    max_history_tokens: int = Field(default=4000, alias="MAX_HISTORY_TOKENS")

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_jwt_secret: str | None = Field(default=None, alias="SUPABASE_JWT_SECRET")
    supabase_jwt_audience: str | None = Field(default=None, alias="SUPABASE_JWT_AUDIENCE")
    supabase_jwt_issuer: str | None = Field(default=None, alias="SUPABASE_JWT_ISSUER")
    supabase_jwks_url: str | None = Field(default=None, alias="SUPABASE_JWKS_URL")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")

    cron_shared_secret: str | None = Field(default=None, alias="CRON_SHARED_SECRET")

    set_centric_logging: bool = Field(default=True, alias="SET_CENTRIC_LOGGING")
    library_screen_enabled: bool = Field(default=True, alias="LIBRARY_SCREEN_ENABLED")
    analysis_on_demand_only: bool = Field(default=True, alias="ANALYSIS_ON_DEMAND_ONLY")
    plans_enabled: bool = Field(default=True, alias="PLANS_ENABLED")
    favorites_ordering_enabled: bool = Field(default=True, alias="FAVORITES_ORDERING_ENABLED")
    home_dashboard_enabled: bool = Field(default=True, alias="HOME_DASHBOARD_ENABLED")
    machine_rating_enabled: bool = Field(default=True, alias="MACHINE_RATING_ENABLED")
    pinned_favorites_enabled: bool = Field(default=True, alias="PINNED_FAVORITES_ENABLED")
    machine_autofill_enabled: bool = Field(default=True, alias="MACHINE_AUTOFILL_ENABLED")
    weighted_muscle_profile_workload_enabled: bool = Field(default=True, alias="WEIGHTED_MUSCLE_PROFILE_WORKLOAD_ENABLED")
    fixed_option_machine_taxonomy_enabled: bool = Field(default=True, alias="FIXED_OPTION_MACHINE_TAXONOMY_ENABLED")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str] | None) -> list[str]:
        if value is None:
            return ["http://localhost:5173"]
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return [origin.strip() for origin in value if str(origin).strip()]


    @field_validator(
        "set_centric_logging",
        "library_screen_enabled",
        "analysis_on_demand_only",
        "plans_enabled",
        "favorites_ordering_enabled",
        "home_dashboard_enabled",
        "machine_rating_enabled",
        "pinned_favorites_enabled",
        "machine_autofill_enabled",
        "weighted_muscle_profile_workload_enabled",
        "fixed_option_machine_taxonomy_enabled",
        mode="before",
    )
    @classmethod
    def parse_rollout_flag_bool(cls, value: object, info: ValidationInfo) -> bool:
        field = cls.model_fields[info.field_name]
        default = bool(field.default)

        if value is None:
            return default

        if isinstance(value, bool):
            return value

        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                logger.warning(
                    "Invalid empty value for %s; using default %s", field.alias or info.field_name, default
                )
                return default
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off"}:
                return False

        logger.warning(
            "Invalid value %r for %s; using default %s",
            value,
            field.alias or info.field_name,
            default,
        )
        return default

    @field_validator("supabase_url", mode="before")
    @classmethod
    def normalize_supabase_url(cls, value: str | None) -> str:
        return (value or "").rstrip("/")

    @property
    def allow_all_origins(self) -> bool:
        return len(self.allowed_origins) == 1 and self.allowed_origins[0] == "*"

    @property
    def supabase(self) -> SupabaseSettings:
        return SupabaseSettings(
            url=self.supabase_url,
            jwt_secret=self.supabase_jwt_secret,
            jwt_audience=self.supabase_jwt_audience,
            jwt_issuer=self.supabase_jwt_issuer,
            jwks_url=self.supabase_jwks_url,
            service_role_key=self.supabase_service_role_key,
        )

    @property
    def feature_flags(self) -> FeatureFlagSettings:
        return FeatureFlagSettings(
            set_centric_logging=self.set_centric_logging,
            library_screen_enabled=self.library_screen_enabled,
            analysis_on_demand_only=self.analysis_on_demand_only,
            plans_enabled=self.plans_enabled,
            favorites_ordering_enabled=self.favorites_ordering_enabled,
            home_dashboard_enabled=self.home_dashboard_enabled,
            machine_rating_enabled=self.machine_rating_enabled,
            pinned_favorites_enabled=self.pinned_favorites_enabled,
            machine_autofill_enabled=self.machine_autofill_enabled,
            weighted_muscle_profile_workload_enabled=self.weighted_muscle_profile_workload_enabled,
            fixed_option_machine_taxonomy_enabled=self.fixed_option_machine_taxonomy_enabled,
        )

    @property
    def feature_flags_response(self) -> dict[str, bool]:
        return self.feature_flags.rollout_flags

    @property
    def healthz_response(self) -> dict[str, str | dict[str, bool]]:
        return {
            "status": "ok",
            "model": self.anthropic_model,
            "rollout_flags": self.feature_flags_response,
        }

    def validate_startup_requirements(self) -> None:
        missing: list[str] = []
        if not self.anthropic_api_key:
            missing.append("ANTHROPIC_API_KEY")
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_service_role_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if missing:
            missing_str = ", ".join(missing)
            raise ValueError(f"Missing required settings: {missing_str}")

    def require_anthropic_api_key(self) -> str:
        if not self.anthropic_api_key:
            raise ValueError("Missing required settings: ANTHROPIC_API_KEY")
        return self.anthropic_api_key

    def require_supabase_admin(self) -> tuple[str, str]:
        if not self.supabase_url or not self.supabase_service_role_key:
            raise ValueError("Missing required settings: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        return self.supabase_url, self.supabase_service_role_key

    def require_cron_shared_secret(self) -> str:
        if not self.cron_shared_secret:
            raise ValueError("Missing required settings: CRON_SHARED_SECRET")
        return self.cron_shared_secret


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()


settings = get_settings()
