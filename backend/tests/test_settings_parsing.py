import pytest

from settings import AppSettings


@pytest.mark.parametrize("raw_value", ["1", "true", "TRUE", " yes ", "On"])
def test_rollout_flags_parse_truthy_strings(monkeypatch: pytest.MonkeyPatch, raw_value: str) -> None:
    monkeypatch.setenv("SET_CENTRIC_LOGGING", raw_value)

    parsed = AppSettings().set_centric_logging

    assert parsed is True


@pytest.mark.parametrize("raw_value", ["0", "false", "FALSE", " no ", "Off"])
def test_rollout_flags_parse_falsy_strings(monkeypatch: pytest.MonkeyPatch, raw_value: str) -> None:
    monkeypatch.setenv("SET_CENTRIC_LOGGING", raw_value)

    parsed = AppSettings().set_centric_logging

    assert parsed is False


@pytest.mark.parametrize("raw_value", ["", "definitely", "10", "null"])
def test_rollout_flags_invalid_values_fall_back_to_default(
    monkeypatch: pytest.MonkeyPatch, raw_value: str
) -> None:
    monkeypatch.setenv("SET_CENTRIC_LOGGING", raw_value)

    parsed = AppSettings().set_centric_logging

    assert parsed is True


def test_rollout_flags_default_when_env_var_is_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SET_CENTRIC_LOGGING", raising=False)

    parsed = AppSettings().set_centric_logging

    assert parsed is True


def test_supabase_issuer_and_jwks_fallback_to_supabase_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example-project.supabase.co/")
    monkeypatch.delenv("SUPABASE_JWT_ISSUER", raising=False)
    monkeypatch.delenv("SUPABASE_JWKS_URL", raising=False)

    supabase = AppSettings().supabase

    assert supabase.url == "https://example-project.supabase.co"
    assert supabase.resolved_jwt_issuer == "https://example-project.supabase.co/auth/v1"
    assert supabase.resolved_jwks_url == "https://example-project.supabase.co/auth/v1/.well-known/jwks.json"


def test_supabase_explicit_issuer_and_jwks_override_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example-project.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://issuer.override/auth/v1")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://issuer.override/jwks")

    supabase = AppSettings().supabase

    assert supabase.resolved_jwt_issuer == "https://issuer.override/auth/v1"
    assert supabase.resolved_jwks_url == "https://issuer.override/jwks"
