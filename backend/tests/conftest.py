import sys
from pathlib import Path

import pydantic_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if not hasattr(pydantic_settings, "NoDecode"):
    class NoDecode:  # pragma: no cover - compatibility shim for older pydantic-settings exports.
        pass

    pydantic_settings.NoDecode = NoDecode
