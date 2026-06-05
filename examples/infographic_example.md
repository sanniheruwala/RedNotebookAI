# Generating an infographic

From the UI (right sidebar → Knowledge → "Generate infographic") or via the API:

```bash
curl -X POST http://localhost:8000/api/infographics/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "template": "executive_kpi_brief",
    "title_hint": "Q1 customer growth",
    "columns": [
      {"name": "nationkey", "data_type": "bigint"},
      {"name": "customers", "data_type": "bigint"}
    ],
    "sample_rows": [
      {"nationkey": 1, "customers": 2503},
      {"nationkey": 2, "customers": 2497}
    ],
    "aggregated_stats": {"row_count": 25},
    "persist": false
  }'
```

The response contains:

- `brief` — structured infographic brief (title, summary, metrics, insights)
- `html` — standalone HTML document ready to render or attach
- `export_path` — set when `persist` is true and a knowledge notebook id is provided

You can pipe `html` straight into a file:

```bash
... | jq -r '.html' > q1_growth.html && open q1_growth.html
```
