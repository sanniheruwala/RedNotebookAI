# Trino HTTPS connection example

Minimal working configuration for the RedNotebook AI Trino connector.

```env
TRINO_HOST=trino.example.com
TRINO_PORT=443
TRINO_SCHEME=https
TRINO_USER=alice
TRINO_PASSWORD=...
TRINO_CATALOG=hive
TRINO_SCHEMA=default
TRINO_VERIFY_SSL=true
```

Or programmatically:

```python
from pydantic import SecretStr
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector

cfg = TrinoConnectionConfig(
    connection_name="prod-trino",
    host="trino.example.com",
    port=443,
    scheme="https",
    user="alice",
    password=SecretStr("secret"),
    catalog="hive",
    schema="default",
    verify_ssl=True,
)

connector = TrinoConnector(cfg)
print("ok" if connector.test_connection() else "failed")
```

With self-signed certificates, point `ca_certificate_path` at the CA bundle.

For Kerberos / OAuth flows, plug them in via `http_headers` and
`session_properties` — the connector forwards both to the Trino client.
