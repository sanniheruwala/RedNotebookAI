"""NotebookLM Enterprise provider stub.

Experimental. We DO NOT scrape NotebookLM or use unofficial endpoints. This
file documents the official integration surface; the implementation remains a
clean stub that raises when called unless explicit credentials are configured.

Reference (subject to change): Vertex AI / NotebookLM Enterprise APIs require
google-cloud-aiplatform with appropriate IAM, project, and endpoint locations.
"""

from __future__ import annotations

from rednotebook.config.settings import Settings


class NotebookLMEnterpriseNotConfigured(RuntimeError):
    """Raised when NotebookLM Enterprise is selected but not configured."""


class NotebookLMEnterpriseProvider:
    """Stub for the NotebookLM Enterprise integration."""

    def __init__(self, settings: Settings) -> None:
        if not settings.notebooklm_enterprise_enabled:
            raise NotebookLMEnterpriseNotConfigured(
                "Set NOTEBOOKLM_ENTERPRISE_ENABLED=true to opt in."
            )
        if not settings.google_cloud_project:
            raise NotebookLMEnterpriseNotConfigured(
                "GOOGLE_CLOUD_PROJECT is required."
            )
        self.project = settings.google_cloud_project
        self.location = settings.notebooklm_endpoint_location

    def create_notebook(self, name: str, description: str | None = None) -> str:
        raise NotImplementedError(
            "NotebookLM Enterprise provider is not yet implemented. "
            "Use the internal provider for MVP."
        )

    def upload_source(self, notebook_id: str, source: dict) -> str:
        raise NotImplementedError(
            "NotebookLM Enterprise provider is not yet implemented."
        )
