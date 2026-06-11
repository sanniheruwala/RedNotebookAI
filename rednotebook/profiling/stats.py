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


def histogram(values: list[Any], bins: int = 10) -> list[dict[str, float]] | None:
    """Equal-width histogram of numeric values.

    Returns a list of ``{lo, hi, count}`` dicts ready for sparkline-style
    rendering, or ``None`` when there's nothing numeric to histogram or
    every value collapses to a single point.
    """
    nums = [float(v) for v in values if is_number(v)]
    if not nums:
        return None
    lo = min(nums)
    hi = max(nums)
    if lo == hi:
        # Single-valued column — one wide bucket is more honest than ten
        # spuriously zero-width bins.
        return [{"lo": lo, "hi": hi, "count": float(len(nums))}]
    bins = max(2, min(int(bins), 50))
    width = (hi - lo) / bins
    counts = [0] * bins
    for v in nums:
        idx = int((v - lo) / width)
        if idx >= bins:
            idx = bins - 1
        counts[idx] += 1
    return [
        {"lo": lo + i * width, "hi": lo + (i + 1) * width, "count": float(c)}
        for i, c in enumerate(counts)
    ]


def _discretize(values: list[Any], bins: int = 8) -> list[int]:
    """Map values to integer bucket labels suitable for MI estimation.

    Numeric values are binned into ``bins`` equal-width buckets.
    Categorical values (strings, bools) keep their identity, capped to
    the most frequent ``bins`` levels so a high-cardinality column
    doesn't inflate the mutual-information score artificially. Nulls map
    to a dedicated label.
    """
    nums = [float(v) for v in values if is_number(v)]
    nullable: list[int] = []
    if nums and len(nums) >= max(2, int(0.5 * len(values))):
        lo = min(nums)
        hi = max(nums)
        if lo == hi:
            return [-1 if v is None else 0 for v in values]
        width = (hi - lo) / bins
        for v in values:
            if v is None or not is_number(v):
                nullable.append(-1)
            else:
                idx = int((float(v) - lo) / width)
                nullable.append(min(idx, bins - 1))
        return nullable
    # Categorical path: keep top-``bins`` levels, fold the rest into "OTHER".
    counts: dict[Any, int] = {}
    for v in values:
        if v is None:
            continue
        key = v if isinstance(v, (str, int, float, bool)) else str(v)
        counts[key] = counts.get(key, 0) + 1
    top_keys = {
        k: idx
        for idx, (k, _) in enumerate(
            sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))[:bins]
        )
    }
    other = len(top_keys)
    out = []
    for v in values:
        if v is None:
            out.append(-1)
            continue
        key = v if isinstance(v, (str, int, float, bool)) else str(v)
        out.append(top_keys.get(key, other))
    return out


def mutual_information(a: list[int], b: list[int]) -> float:
    """Mutual information (in nats) between two equally-sized integer label
    sequences. Pairs where either side is the null sentinel (-1) are dropped
    so the score reflects co-presence, not null alignment.

    Returns 0 when one side is constant or the joint support is empty.
    """
    import math

    if len(a) != len(b) or not a:
        return 0.0
    pairs = [(x, y) for x, y in zip(a, b, strict=False) if x != -1 and y != -1]
    n = len(pairs)
    if n == 0:
        return 0.0
    pxy: dict[tuple[int, int], int] = {}
    px: dict[int, int] = {}
    py: dict[int, int] = {}
    for x, y in pairs:
        pxy[(x, y)] = pxy.get((x, y), 0) + 1
        px[x] = px.get(x, 0) + 1
        py[y] = py.get(y, 0) + 1
    if len(px) < 2 or len(py) < 2:
        return 0.0
    mi = 0.0
    for (x, y), c in pxy.items():
        p_xy = c / n
        p_x = px[x] / n
        p_y = py[y] / n
        if p_xy > 0:
            mi += p_xy * math.log(p_xy / (p_x * p_y))
    return max(0.0, mi)


def related_columns(
    columns_values: dict[str, list[Any]],
    *,
    top: int = 10,
    max_columns: int = 20,
) -> list[dict[str, float]]:
    """Return the most related column pairs by mutual information.

    Caps at the first ``max_columns`` columns to keep the cost manageable
    on wide results (the comparison is O(n²) in column count). Returns a
    sorted list of ``{a, b, score}`` dicts, where ``score`` is normalised
    to ``[0, 1]`` against the smaller column's entropy.
    """
    import math

    keys = list(columns_values.keys())[:max_columns]
    if len(keys) < 2:
        return []
    discrete = {k: _discretize(columns_values[k]) for k in keys}

    def entropy(labels: list[int]) -> float:
        from collections import Counter

        nz = [x for x in labels if x != -1]
        n = len(nz)
        if n == 0:
            return 0.0
        counts = Counter(nz)
        return -sum((c / n) * math.log(c / n) for c in counts.values() if c)

    entropies = {k: entropy(discrete[k]) for k in keys}

    pairs: list[dict[str, Any]] = []
    for i, a in enumerate(keys):
        for b in keys[i + 1 :]:
            mi = mutual_information(discrete[a], discrete[b])
            denom = min(entropies[a], entropies[b])
            if denom <= 0:
                continue
            normalized = mi / denom
            if normalized < 0.05:
                # Drop noise — pairs with < 5% normalised MI rarely tell
                # the analyst anything actionable.
                continue
            pairs.append({"a": a, "b": b, "score": min(1.0, normalized)})

    pairs.sort(key=lambda p: -p["score"])
    return pairs[:top]
