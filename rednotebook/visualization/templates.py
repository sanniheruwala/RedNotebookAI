"""Infographic templates."""

from __future__ import annotations

INFOGRAPHIC_TEMPLATES: dict[str, dict[str, str]] = {
    "executive_kpi_brief": {
        "title": "Executive KPI Brief",
        "description": "Headline KPIs with trend snapshots and a stakeholder summary.",
    },
    "trend_analysis": {
        "title": "Trend Analysis",
        "description": "Time-series-led narrative with seasonality callouts.",
    },
    "funnel_analysis": {
        "title": "Funnel Analysis",
        "description": "Step-by-step conversion drop-off with diagnostic notes.",
    },
    "cohort_analysis": {
        "title": "Cohort Analysis",
        "description": "Retention and behavior across acquisition cohorts.",
    },
    "cost_optimization_report": {
        "title": "Cost Optimization Report",
        "description": "Top cost drivers and opportunities for savings.",
    },
    "data_quality_report": {
        "title": "Data Quality Report",
        "description": "Null counts, anomalies, PII flags, and freshness issues.",
    },
    "revenue_breakdown": {
        "title": "Revenue Breakdown",
        "description": "Revenue split by dimensions, with YoY/MoM deltas.",
    },
    "operational_performance_summary": {
        "title": "Operational Performance Summary",
        "description": "SLA, throughput, and incident overview.",
    },
}


def list_templates() -> list[dict[str, str]]:
    return [{"id": k, **v} for k, v in INFOGRAPHIC_TEMPLATES.items()]
