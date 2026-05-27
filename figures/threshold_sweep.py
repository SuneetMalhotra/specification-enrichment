#!/usr/bin/env python3
"""Generate threshold_sweep.png for Article 1, Figure 3.

Reads the tau-threshold sweep from ``results/results_threshold_sweep.json``
(enrichment-run-B, the section 4.4 input) and renders a stacked bar
chart of test-case category mix at each tau in {0.5, 0.6, 0.7, 0.8,
0.9}. Each stacked bar totals N=16 test cases. The default tau=0.7
column is highlighted with a darker border.

Run from the repository root:

    python figures/threshold_sweep.py
"""
from __future__ import annotations

import json
import os
import sys

import matplotlib.pyplot as plt
import numpy as np


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_PATH = os.path.join(REPO_ROOT, "results", "results_threshold_sweep.json")
OUT_PATH = os.path.join(REPO_ROOT, "figures", "threshold_sweep.png")

CATEGORIES = [
    "happy-path",
    "edge-case",
    "error-handling",
    "accessibility",
    "persistence",
    "other",
]

COLORS = {
    "happy-path": "#4C72B0",
    "edge-case": "#DD8452",
    "error-handling": "#55A868",
    "accessibility": "#C44E52",
    "persistence": "#8172B2",
    "other": "#937860",
}


def main() -> int:
    with open(RESULTS_PATH) as f:
        data = json.load(f)
    sweep = data["sweep"]

    thresholds = [row["threshold"] for row in sweep]
    by_cat = {cat: [row["categories"].get(cat, 0) for row in sweep] for cat in CATEGORIES}

    x = np.arange(len(thresholds))
    width = 0.6

    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    bottoms = np.zeros(len(thresholds))
    for cat in CATEGORIES:
        vals = np.array(by_cat[cat], dtype=float)
        ax.bar(
            x,
            vals,
            width=width,
            bottom=bottoms,
            label=cat,
            color=COLORS[cat],
            edgecolor="black",
            linewidth=0.4,
        )
        bottoms += vals

    # Highlight tau=0.7 (the default) with a thicker outline rectangle
    default_idx = thresholds.index(0.7)
    ax.add_patch(
        plt.Rectangle(
            (x[default_idx] - width / 2 - 0.02, -0.3),
            width + 0.04,
            16.6,
            fill=False,
            edgecolor="black",
            linewidth=2.0,
            linestyle="--",
        )
    )
    ax.text(x[default_idx], 16.5, "default", ha="center", va="bottom", fontsize=8, fontstyle="italic")

    # Silent / questions annotations
    for i, row in enumerate(sweep):
        ax.text(
            x[i],
            -0.6,
            f"silent={row['silentConstraints']}\nQ={row['reviewQuestions']}",
            ha="center",
            va="top",
            fontsize=7,
        )

    ax.set_xticks(x)
    ax.set_xticklabels([f"tau={t}" for t in thresholds])
    ax.set_ylabel("Test-case count (N=16)")
    ax.set_title(
        "Enriched-16 category mix vs. silent-incorporation threshold tau\n"
        "TodoMVC, enrichment-run-B"
    )
    ax.set_ylim(-1.5, 18)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.95, ncol=2)
    ax.grid(axis="y", linestyle=":", linewidth=0.5, alpha=0.6)

    plt.tight_layout()
    plt.savefig(OUT_PATH, dpi=150)
    print(f"wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
