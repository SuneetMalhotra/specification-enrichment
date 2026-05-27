#!/usr/bin/env python3
"""Generate confidence_histogram.png for Article 1, Figure 1.

Reads confidence scores for the 15 implicit constraints surfaced on
TodoMVC by the Specification Enrichment stage (enrichment-run-A, the
generator input for the section 4.3 primary results) from
``results/results_threshold_sweep.json`` and renders a per-constraint
bar chart, color-coded by the four-category taxonomy from section 4.2
(Behavioral, Resilience, Accessibility, Internationalization). The
dashed vertical line marks the default tau=0.7 silent-incorporation
threshold.

Run from the repository root:

    python figures/confidence_histogram.py
"""
from __future__ import annotations

import json
import os
import sys

import matplotlib.pyplot as plt


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_PATH = os.path.join(REPO_ROOT, "results", "results_threshold_sweep.json")
OUT_PATH = os.path.join(REPO_ROOT, "figures", "confidence_histogram.png")

# Section 4.2 four-category regrouping. The raw category labels in the
# enrichment JSON (validation, edge-case, accessibility, persistence,
# internationalization, other) are remapped per the published taxonomy.
TAXONOMY = {
    "C1": "Behavioral",
    "C2": "Behavioral",
    "C3": "Behavioral",
    "C4": "Internationalization",
    "C5": "Behavioral",
    "C6": "Resilience",
    "C7": "Resilience",
    "C8": "Accessibility",
    "C9": "Resilience",
    "C10": "Resilience",
    "C11": "Behavioral",
    "C12": "Behavioral",
    "C13": "Behavioral",
    "C14": "Behavioral",
    "C15": "Internationalization",
}

COLORS = {
    "Behavioral": "#4C72B0",
    "Resilience": "#55A868",
    "Accessibility": "#C44E52",
    "Internationalization": "#8172B2",
}


def main() -> int:
    with open(RESULTS_PATH) as f:
        data = json.load(f)
    confidences = data["confidences"]

    ids = [c["id"] for c in confidences]
    vals = [c["confidence"] for c in confidences]
    cats = [TAXONOMY[c["id"]] for c in confidences]
    colors = [COLORS[t] for t in cats]

    fig, ax = plt.subplots(figsize=(8.5, 4.5))
    bars = ax.bar(ids, vals, color=colors, edgecolor="black", linewidth=0.5)
    ax.axvline(x=-0.5, color="none")  # placeholder for clean axis
    ax.axhline(y=0.7, color="black", linestyle="--", linewidth=1.0)
    # tau=0.7 annotation anchored on the LEFT (at the y-axis edge of the plot,
    # in axes coordinates), with a white background, so it cannot collide with
    # any bar (per v23 review fix — previous right-edge placement clipped C15
    # and overprinted the title).
    ax.text(
        0.005,
        0.71 / 1.05,
        "tau = 0.7 (silent-incorporation threshold)",
        ha="left",
        va="bottom",
        fontsize=8,
        transform=ax.transAxes,
        bbox=dict(facecolor="white", edgecolor="none", pad=1.0),
    )

    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Model-reported confidence")
    ax.set_xlabel("Constraint ID")
    ax.set_title(
        "Confidence scores for the 15 implicit constraints surfaced on TodoMVC"
    )

    # Legend
    handles = [
        plt.Rectangle((0, 0), 1, 1, color=COLORS[k], edgecolor="black", linewidth=0.5)
        for k in COLORS
    ]
    ax.legend(handles, list(COLORS.keys()), loc="lower left", fontsize=8, framealpha=0.95)

    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.2f}", ha="center", va="bottom", fontsize=7)

    plt.tight_layout()
    plt.savefig(OUT_PATH, dpi=150)
    print(f"wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
