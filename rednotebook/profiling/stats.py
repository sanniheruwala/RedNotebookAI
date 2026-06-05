"""Numeric helpers used by the profiler.

Kept dependency-free (no pandas) so they work on raw row-of-dicts data.
"""

from __future__ import annotations

import math
from typing import Any


def is_number(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and not (
        isinstance(value, float) and math.isnan(value)
    )


def numeric_summary(values: list[Any]) -> dict[str, float] | None:
    nums = [float(v) for v in values if is_number(v)]
    if not nums:
        return None
    nums_sorted = sorted(nums)
    n = len(nums_sorted)
    mean = sum(nums_sorted) / n
    median = (
        nums_sorted[n // 2]
        if n % 2
        else (nums_sorted[n // 2 - 1] + nums_sorted[n // 2]) / 2
    )
    variance = sum((x - mean) ** 2 for x in nums_sorted) / n
    return {
        "min": nums_sorted[0],
        "max": nums_sorted[-1],
        "mean": mean,
        "median": median,
        "stddev": math.sqrt(variance),
        "count": float(n),
    }


def top_values(values: list[Any], k: int = 5) -> list[dict[str, Any]]:
    counts: dict[Any, int] = {}
    for v in values:
        if v is None:
            continue
        key = v if isinstance(v, (str, int, float, bool)) else str(v)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"value": k_, "count": c}
        for k_, c in sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))[:k]
    ]
