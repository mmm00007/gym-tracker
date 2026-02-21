import ast
from pathlib import Path


MAIN_PATH = Path(__file__).resolve().parents[1] / "main.py"


def test_main_does_not_use_raw_environment_parsing() -> None:
    tree = ast.parse(MAIN_PATH.read_text(), filename=str(MAIN_PATH))

    forbidden_patterns: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "os":
                    forbidden_patterns.append("import os")

        if isinstance(node, ast.ImportFrom) and node.module == "os":
            forbidden_patterns.append("from os import ...")

        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name) and node.func.value.id == "os":
                if node.func.attr in {"getenv"}:
                    forbidden_patterns.append(f"os.{node.func.attr}(...)")
                if node.func.attr == "environ":
                    forbidden_patterns.append("os.environ(...)")

        if isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == "os" and node.attr == "environ":
                forbidden_patterns.append("os.environ")

    assert forbidden_patterns == []
