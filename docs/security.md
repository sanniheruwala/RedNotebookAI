# Security

## SQL guard

`rednotebook.security.sql_guard.check_sql` evaluates every SQL statement and
returns one of:

- `ALLOWED` — read-only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN
- `WARN` — write statement, but writes are enabled (`ALLOW_WRITE_QUERIES=true`)
- `BLOCKED` — destructive, write, or otherwise disallowed

Two layers cooperate:

1. A **keyword scanner** that strips comments + string literals before tokenizing.
2. **sqlglot** parses the statement (when installed) for stronger classification.

Multi-statement scripts are split and evaluated per statement. If any
statement is dangerous, the whole script is blocked / warned.

Even with writes enabled, the notebook runner requires `confirm_write=True`
to actually execute the SQL.

## Secret management

- `.env` is the only place credentials live. Never commit it.
- `mask_secrets()` strips API keys, JWTs, bearer tokens, and AWS-style keys
  before AI calls or knowledge sources are persisted.
- Trino passwords are wrapped in `pydantic.SecretStr` and never serialized.

## PII / restricted data

`rednotebook.profiling.pii_detector` classifies columns into:

- `PII` — email, phone, name, address, card number, IBAN, ...
- `Restricted` — password, token, secret, api_key, session_id, OTP, ...
- `NotSensitive` — pure numeric / temporal columns with no name signal
- `Unknown` — everything else

Detection uses column-name keywords + value-pattern heuristics (emails, card
numbers, IBANs, JWT/bearer tokens, phone numbers). Restricted/PII columns are
masked before AI sample sharing.

## External provider risks

- AI providers receive only what the privacy-mode allows. No credentials.
- The NotebookLM Enterprise provider is a stub — no scraping, no unofficial
  endpoints, disabled unless explicit Google Cloud config is set.
