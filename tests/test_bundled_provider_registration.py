"""Smoke tests for the bundled (Qwen 1.5B local) AI provider.

These do NOT load the model — they cover the integration shape only:
the module imports cleanly when llama-cpp-python is absent, the
provider registers when llama-cpp-python is present, and the registry
falls back to mock when bundled fails to instantiate (which is the
state on any machine without the GGUF file). Actually running a
prompt against the model is covered by manual smoke testing — adding
a 1 GB GGUF to CI fixtures would explode the test runtime.
"""

from __future__ import annotations

import importlib
import sys
from unittest.mock import MagicMock

from rednotebook.ai.registry import _REGISTRY, get_provider, list_providers
from rednotebook.config.settings import Settings


def test_module_imports_when_llama_cpp_absent(monkeypatch):
    """If llama_cpp isn't installed, importing the module must still
    succeed — the failure surfaces only when somebody tries to *use*
    the provider, at which point the registry's try/except in
    get_provider catches it and falls back to mock.
    """
    monkeypatch.setitem(sys.modules, "llama_cpp", None)
    # Force a fresh import so the module-top-level code re-executes.
    if "rednotebook.ai.bundled_provider" in sys.modules:
        del sys.modules["rednotebook.ai.bundled_provider"]
    mod = importlib.import_module("rednotebook.ai.bundled_provider")
    assert mod.BundledAIProvider.name == "bundled"


def test_provider_registered_after_module_import():
    importlib.import_module("rednotebook.ai.bundled_provider")
    assert "bundled" in list_providers()
    assert _REGISTRY["bundled"].name == "bundled"


def test_get_provider_falls_back_when_model_missing(monkeypatch):
    """If a user sets AI_PROVIDER=bundled but no GGUF is on disk, the
    registry's defensive try/except must drop us back to mock with a
    warning — never crash the AI endpoint."""
    importlib.import_module("rednotebook.ai.bundled_provider")

    # Pretend llama_cpp.Llama exists but raise on instantiation, mimicking
    # the "model file missing" path that runs after a successful import.
    fake_llama = MagicMock()
    fake_llama.side_effect = FileNotFoundError("no gguf")
    monkeypatch.setitem(
        sys.modules,
        "llama_cpp",
        MagicMock(Llama=fake_llama),
    )

    cfg = Settings(ai_provider="bundled")
    provider = get_provider(cfg)
    assert provider.name == "mock", (
        "bundled with no model file must degrade to mock, not crash"
    )
