"""Rule-based PII / sensitive data detector.

Two signals are combined:
1. The column name (most predictive in practice).
2. Sample value patterns (for unnamed/aliased columns).

Each column is classified into one of: PII, Restricted, NotSensitive, Unknown.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from rednotebook.connectors.base import ColumnInfo

PIIClassification = Literal["PII", "Restricted", "NotSensitive", "Unknown"]

# Column-name signals
_NAME_PII: tuple[str, ...] = (
    "email",
    "phone",
    "mobile",
    "first_name",
    "last_name",
    "full_name",
    "fullname",
    "address",
    "street",
    "zip",
    "postal",
    "ssn",
    "tax_id",
    "iban",
    "swift",
    "card_number",
    "card_pan",
    "credit_card",
    "cvv",
    "expiry",
    "expire_date",
    "bank_account",
    "account_number",
    "dob",
    "birth",
    "gps",
    "latitude",
    "longitude",
    "device_id",
    "device_fingerprint",
)

_NAME_RESTRICTED: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "auth_token",
    "session_id",
    "session_token",
    "otp",
    "mfa",
    "totp",
    "private_key",
    "token",
)

# Value patterns
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"^\+?\d[\d\s().-]{6,}$")
_CC_RE = re.compile(r"^\d{13,19}$")
_IBAN_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$")
_JWT_RE = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
_BEARER_RE = re.compile(r"(?i)^bearer\s+\S+")


@dataclass(frozen=True)
class _Hit:
    classification: PIIClassification
    reason: str


def _name_hit(name: str) -> _Hit | None:
    n = name.lower().strip()
    for key in _NAME_RESTRICTED:
        if key in n:
            return _Hit("Restricted", f"name matches '{key}'")
    for key in _NAME_PII:
        if key in n:
            return _Hit("PII", f"name matches '{key}'")
    return None


def _value_hit(values: list[Any]) -> _Hit | None:
    strings = [str(v) for v in values if v is not None][:50]
    if not strings:
        return None
    if any(_BEARER_RE.match(s) or _JWT_RE.match(s) for s in strings):
        return _Hit("Restricted", "value looks like a token")
    if sum(1 for s in strings if _EMAIL_RE.search(s)) >= max(1, len(strings) // 3):
        return _Hit("PII", "values look like emails")
    if sum(1 for s in strings if _CC_RE.match(s.replace(" ", ""))) >= max(1, len(strings) // 3):
        return _Hit("PII", "values look like card numbers")
    if sum(1 for s in strings if _IBAN_RE.match(s.replace(" ", "").upper())) >= max(1, len(strings) // 3):
        return _Hit("PII", "values look like IBANs")
    if sum(1 for s in strings if _PHONE_RE.match(s)) >= max(1, len(strings) // 2):
        return _Hit("PII", "values look like phone numbers")
    return None


def classify_column(column: ColumnInfo, sample_values: list[Any]) -> PIIClassification:
    """Classify a single column."""
    hit = _name_hit(column.name) or _value_hit(sample_values)
    return hit.classification if hit else _default_for(column)


def classify_columns(
    columns: list[ColumnInfo],
    rows: list[dict[str, Any]],
) -> dict[str, PIIClassification]:
    """Classify every column in a result. Returns a {name: label} mapping."""
    out: dict[str, PIIClassification] = {}
    for col in columns:
        values = [row.get(col.name) for row in rows]
        out[col.name] = classify_column(col, values)
    return out


def _default_for(column: ColumnInfo) -> PIIClassification:
    dt = column.data_type.lower()
    # Pure numeric/temporal types with no name signal are almost never PII on their own.
    if any(t in dt for t in ("int", "decimal", "double", "real", "numeric", "float", "bigint")):
        return "NotSensitive"
    if any(t in dt for t in ("date", "time", "timestamp")):
        return "NotSensitive"
    if any(t in dt for t in ("bool",)):
        return "NotSensitive"
    return "Unknown"
