#!/usr/bin/env python3
"""Generate category_coverage.png for Article 1, Figure 2.

Plots test-case category coverage on TodoMVC across the four reported
configurations: Baseline-12, Baseline-16, Baseline-16-Enhanced, and
Enriched-16. Baseline-12 is a single run; the three N=16
configurations are three-seed groups (medians shown as bars, [min,max]
as error bars).

Seed sources:
  * Baseline-16 seed 1  -> results/results_baseline16_count_matched.json
  * Baseline-16 seeds 2,3 -> results/results_multi_seed.json
  * Enhanced     seed 1  -> results/results_baseline16_enhanced.json
  * Enhanced     seeds 2,3 -> results/results_multi_seed.json
  * Enriched-16  seed 1  -> results/results_v2_lenient_judge_2026-05-24.json
  * Enriched-16  seeds 2,3 -> results/results_multi_seed.json
  * Baseline-12          -> results/results_v2_lenient_judge_2026-05-24.json
                            (baseline block from the original E2 run, which
                            is the source for the manuscript section 4.3
                            primary table Baseline-12 row)

Run from the repository root:

    python figures/category_coverage.py
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from collections import Counter

import matplotlib.pyplot as plt
import numpy as np


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO_ROOT, "results")
OUT_PATH = os.path.join(REPO_ROOT, "figures", "category_coverage.png")

CATEGORIES = [
    "happy-path",
    "edge-case",
    "error-handling",
    "accessibility",
    "persistence",
    "other",
]


def count_categories(test_cases) -> Counter:
    return Counter(tc.get("category", "other") for tc in test_cases)


def load_json(name):
    with open(os.path.join(RESULTS, name)) as f:
        return json.load(f)


def load_seed1_counts():
    """Section 4.3 seed-1 sources (matching the manuscript)."""
    b16 = count_categories(load_json("results_baseline16_count_matched.json")["testCases"])
    enh = count_categories(load_json("results_baseline16_enhanced.json")["testCases"])
    en = count_categories(load_json("results_v2_lenient_judge_2026-05-24.json")["enriched"]["testCases"])
    return b16, enh, en


def load_multi_seed_counts():
    """Seeds 2 and 3 from results_multi_seed.json."""
    data = load_json("results_multi_seed.json")
    out = {"Baseline-16": [], "Baseline-16-Enhanced": [], "Enriched-16": []}
    for run in data["runs"]:
        out[run["configuration"]].append(Counter(run["categoryCounts"]))
    return out


def load_baseline12():
    data = load_json("results_v2_lenient_judge_2026-05-24.json")
    return count_categories(data["baseline"]["testCases"])


def stack(counts_list, categories):
    arrs = []
    for cat in categories:
        arrs.append([c.get(cat, 0) for c in counts_list])
    return arrs


def main() -> int:
    b16_s1, enh_s1, en_s1 = load_seed1_counts()
    multi = load_multi_seed_counts()
    b12 = load_baseline12()

    b16_all = [b16_s1] + multi["Baseline-16"]
    enh_all = [enh_s1] + multi["Baseline-16-Enhanced"]
    en_all = [en_s1] + multi["Enriched-16"]

    configs = [
        ("Baseline-12\n(N=1)", [b12]),
        ("Baseline-16\n(3-seed)", b16_all),
        ("Enhanced\n(3-seed)", enh_all),
        ("Enriched-16\n(3-seed)", en_all),
    ]

    # Per-config, per-category: median, min, max
    fig, ax = plt.subplots(figsize=(9.5, 5.0))

    n_configs = len(configs)
    n_cats = len(CATEGORIES)
    x = np.arange(n_configs)
    width = 0.13

    palette = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B2", "#937860"]

    for i, cat in enumerate(CATEGORIES):
        meds = []
        mins = []
        maxs = []
        for label, counts in configs:
            vals = [c.get(cat, 0) for c in counts]
            meds.append(statistics.median(vals))
            mins.append(min(vals))
            maxs.append(max(vals))
        meds = np.array(meds, dtype=float)
        mins = np.array(mins, dtype=float)
        maxs = np.array(maxs, dtype=float)
        offsets = (i - (n_cats - 1) / 2) * width
        lower = meds - mins
        upper = maxs - meds
        ax.bar(
            x + offsets,
            meds,
            width=width,
            yerr=[lower, upper],
            capsize=2,
            label=cat,
            color=palette[i],
            edgecolor="black",
            linewidth=0.4,
            error_kw={"linewidth": 0.7, "ecolor": "black"},
        )

    ax.set_xticks(x)
    ax.set_xticklabels([c[0] for c in configs])
    ax.set_ylabel("Test-case count")
    ax.set_title(
        "Test-case category coverage on TodoMVC\n"
        "Bars = three-seed median; error bars span [min, max]; Baseline-12 is a single run"
    )
    ax.legend(loc="upper right", fontsize=8, framealpha=0.95, ncol=2)
    ax.set_ylim(0, 13)
    ax.grid(axis="y", linestyle=":", linewidth=0.5, alpha=0.6)

    plt.tight_layout()
    plt.savefig(OUT_PATH, dpi=150)
    print(f"wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
