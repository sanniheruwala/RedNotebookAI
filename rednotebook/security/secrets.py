"""Secret detection and masking helpers."""

from __future__ import annotations

import re

SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|secret|password|passwd)\s*[:=]\s*[\"']?([A-Za-z0-9_\-./+=]{8,})"),
    re.compile(r"(?i)\b(?:bearer|sk-|xox[abp]-)[A-Za-z0-9_\-./+=]{8,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
)


def mask_secrets(text: str, replacement: str = "***REDACTED***") -> str:
    """Replace anything that looks like a credential with a redaction marker."""
    masked = text
    for pattern in SECRET_PATTERNS:
        masked = pattern.sub(replacement, masked)
    return masked
