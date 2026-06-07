"""Domain-specific errors raised by AI providers.

Routes catch :class:`AIProviderError` and translate it into a 502 with
the underlying provider message, instead of returning an empty / mock
response and pretending everything worked.
"""

from __future__ import annotations


class AIProviderError(RuntimeError):
    """Raised when a configured AI provider fails to fulfil a request.

    Carries the provider name and model so the API response can give
    the user a precise pointer ("Anthropic / claude-sonnet-4-6 returned
    401 invalid x-api-key"), and the original exception so callers can
    log it without losing detail.
    """

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        model: str | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.cause = cause
