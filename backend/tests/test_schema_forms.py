import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from schemas.forms import MachineDTO, RecommendationRequest, SorenessReportEntry


BASE_MACHINE_PAYLOAD = {
    "id": "machine-1",
    "user_id": "user-1",
    "name": "Seated Row",
    "movement": "horizontal_row",
    "equipment_type": "machine",
    "muscle_groups": ["back", "biceps"],
    "thumbnails": ["https://cdn.example.com/m1.png"],
    "instruction_image": "https://cdn.example.com/m1-instructions.png",
    "source": "catalog",
    "notes": "Keep chest up.",
}


def test_machine_dto_requires_core_fields() -> None:
    with pytest.raises(ValidationError):
        MachineDTO.model_validate({"id": "machine-1"})


def test_machine_dto_rejects_media_fields_for_non_machine_equipment() -> None:
    invalid_payload = {
        **BASE_MACHINE_PAYLOAD,
        "equipment_type": "freeweight",
        "thumbnails": ["https://cdn.example.com/not-allowed.png"],
        "instruction_image": None,
        "source": None,
    }

    with pytest.raises(ValidationError):
        MachineDTO.model_validate(invalid_payload)


def test_machine_dto_accepts_representative_valid_payload() -> None:
    machine = MachineDTO.model_validate(BASE_MACHINE_PAYLOAD)

    assert machine.id == "machine-1"
    assert machine.equipment_type == "machine"
    assert machine.thumbnails == ["https://cdn.example.com/m1.png"]


@pytest.mark.parametrize("level", [-1, 4])
def test_soreness_report_enforces_level_range(level: int) -> None:
    with pytest.raises(ValidationError):
        SorenessReportEntry.model_validate(
            {
                "training_bucket_id": "bucket-1",
                "muscle_group": "quads",
                "level": level,
            }
        )


def test_soreness_report_requires_fields() -> None:
    with pytest.raises(ValidationError):
        SorenessReportEntry.model_validate({"muscle_group": "quads", "level": 2})


def test_recommendation_request_accepts_representative_valid_payload() -> None:
    payload = {
        "scope": {
            "grouping": "training_day",
            "date_start": "2026-01-01",
            "date_end": "2026-01-07",
            "included_set_types": ["working", "warmup"],
            "goals": ["hypertrophy"],
            "recommendations": "Increase upper back volume",
        },
        "grouped_training": [
            {
                "training_bucket_id": "bucket-1",
                "training_date": "2026-01-02",
                "sets": [{"machine_id": "machine-1", "reps": 10, "weight": 80}],
            }
        ],
        "equipment": {"machine-1": BASE_MACHINE_PAYLOAD},
        "soreness_data": [
            {"training_bucket_id": "bucket-1", "muscle_group": "back", "level": 2}
        ],
        "scope_id": "scope-1",
    }

    request = RecommendationRequest.model_validate(payload)

    assert request.scope is not None
    assert request.scope.grouping.value == "training_day"
    assert request.equipment is not None and "machine-1" in request.equipment


def test_schema_contract_snapshot_matches_expected() -> None:
    snapshot_path = Path(__file__).parent / "snapshots" / "forms_schema_snapshot.json"
    expected = json.loads(snapshot_path.read_text())

    current = {
        "MachineDTO": MachineDTO.model_json_schema(mode="validation"),
        "RecommendationRequest": RecommendationRequest.model_json_schema(mode="validation"),
        "SorenessReportEntry": SorenessReportEntry.model_json_schema(mode="validation"),
    }

    assert current == expected
