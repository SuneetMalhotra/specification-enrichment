#!/usr/bin/env python3
"""
analysis.py — Score the human spot-audit returns against the LLM-judge key.

Usage:
    python3 analysis.py \\
        --rater1 rater_AB.csv \\
        --rater2 rater_CD.csv \\
        --key    test_cases_KEY.csv \\
        --out    analysis_results.md

Inputs:
    --rater1, --rater2  CSV files matching rater_template.csv (case_id, verdict,
                        justification_2_sentences, time_spent_minutes).
    --key               test_cases_KEY.csv (author-only). The first three '#'
                        comment lines are skipped automatically.

Outputs:
    analysis_results.md — headline metrics, confusion matrices, caveats.

Dependencies:
    Python 3.8+, numpy (stdlib otherwise). The `krippendorff` PyPI package is
    optional; if absent, alpha is computed manually using the same nominal-data
    coincidence-matrix formulation Krippendorff (2004) defines.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

VERDICTS = ["accepted-as-is", "minor-edit", "major-rework"]
ACCEPTABLE_FOR_QA = {"accepted-as-is", "minor-edit"}  # QA-reviewer criterion
NA_MARKERS = {"", "na", "n/a", "NA-judge-not-run-on-seed2"}


# ---------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------

def _strip_comment_header(path: Path) -> io.StringIO:
    """Return a StringIO of the file with leading '#'-prefixed lines removed."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    data_lines = [ln for ln in lines if not ln.lstrip().startswith("#")]
    return io.StringIO("".join(data_lines))


def load_rater(path: Path) -> Dict[str, str]:
    """case_id -> verdict (lowercased, hyphenated)."""
    out: Dict[str, str] = {}
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row["case_id"].strip()
            v = row["verdict"].strip().lower()
            if not cid:
                continue
            if v not in VERDICTS:
                print(f"WARNING [{path.name}] {cid}: verdict {v!r} not in "
                      f"{VERDICTS}; skipping row.", file=sys.stderr)
                continue
            out[cid] = v
    return out


def load_key(path: Path) -> Dict[str, Dict[str, str]]:
    """case_id -> dict of source_configuration / source_category / llm_judge_verdict."""
    out: Dict[str, Dict[str, str]] = {}
    buf = _strip_comment_header(path)
    reader = csv.DictReader(buf)
    for row in reader:
        cid = row["case_id"].strip()
        out[cid] = {
            "source_configuration": row.get("source_configuration", "").strip(),
            "source_category": row.get("source_category", "").strip(),
            "llm_judge_verdict": row.get("llm_judge_verdict", "").strip(),
        }
    return out


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def cohen_kappa(r1: List[str], r2: List[str], categories: List[str]) -> float:
    """Cohen's kappa over a fixed category list (nominal)."""
    assert len(r1) == len(r2) and len(r1) > 0
    n = len(r1)
    idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)
    cm = np.zeros((k, k), dtype=float)
    for a, b in zip(r1, r2):
        cm[idx[a], idx[b]] += 1
    po = float(np.trace(cm)) / n
    row = cm.sum(axis=1) / n
    col = cm.sum(axis=0) / n
    pe = float(np.dot(row, col))
    if pe == 1.0:
        # All raters always picked the same single category — perfect by definition.
        return 1.0
    return (po - pe) / (1.0 - pe)


def krippendorff_alpha_nominal(ratings: List[List[Optional[str]]],
                               categories: List[str]) -> float:
    """
    Nominal-data Krippendorff's alpha.

    `ratings` is a list of rater-lists, each of length N (units). Missing
    values may be None and are dropped from each unit's contribution.
    """
    if not ratings:
        return float("nan")
    n_raters = len(ratings)
    n_units = len(ratings[0])
    for r in ratings:
        assert len(r) == n_units

    # Per-unit value matrix: only units with >= 2 valid ratings contribute.
    units = []
    for u in range(n_units):
        vals = [r[u] for r in ratings if r[u] is not None]
        if len(vals) >= 2:
            units.append(vals)
    if not units:
        return float("nan")

    cat_idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)

    # Coincidence matrix o[c][c'] = sum over units of count-pairs in that unit.
    o = np.zeros((k, k), dtype=float)
    for vals in units:
        mu = len(vals)
        if mu < 2:
            continue
        counts = np.zeros(k, dtype=float)
        for v in vals:
            counts[cat_idx[v]] += 1
        # Standard nominal Krippendorff coincidence contribution per unit:
        # for each ordered pair of distinct raters (c, c'), increment o[c][c']
        # by 1, normalized by (mu - 1).
        for c in range(k):
            for cp in range(k):
                if c == cp:
                    pair_count = counts[c] * (counts[c] - 1)
                else:
                    pair_count = counts[c] * counts[cp]
                o[c, cp] += pair_count / (mu - 1)

    n_c = o.sum(axis=1)  # marginal totals
    n_total = n_c.sum()
    if n_total == 0:
        return float("nan")

    # Observed disagreement (nominal: 1 if categories differ, else 0)
    Do = 0.0
    for c in range(k):
        for cp in range(k):
            if c != cp:
                Do += o[c, cp]
    Do = Do / n_total

    # Expected disagreement
    De = 0.0
    for c in range(k):
        for cp in range(k):
            if c != cp:
                De += n_c[c] * n_c[cp] / (n_total - 1)
    De = De / n_total

    if De == 0:
        return 1.0
    return 1.0 - Do / De


def confusion_matrix(a: List[str], b: List[str], categories: List[str]) -> np.ndarray:
    """rows = a, cols = b."""
    idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)
    cm = np.zeros((k, k), dtype=int)
    for x, y in zip(a, b):
        cm[idx[x], idx[y]] += 1
    return cm


def cm_to_md(cm: np.ndarray, categories: List[str], row_label: str, col_label: str) -> str:
    header = f"| {row_label} \\ {col_label} | " + " | ".join(categories) + " | row total |"
    sep = "|" + "|".join(["---"] * (len(categories) + 2)) + "|"
    lines = [header, sep]
    for i, rc in enumerate(categories):
        cells = [str(int(cm[i, j])) for j in range(len(categories))]
        lines.append(f"| **{rc}** | " + " | ".join(cells) + f" | {int(cm[i].sum())} |")
    col_totals = [str(int(cm[:, j].sum())) for j in range(len(categories))]
    lines.append("| **col total** | " + " | ".join(col_totals) + f" | {int(cm.sum())} |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Per-rater per-configuration acceptance rate
# ---------------------------------------------------------------------------

def acceptance_by_configuration(rater: Dict[str, str],
                                key: Dict[str, Dict[str, str]]) -> Dict[str, Tuple[int, int, float]]:
    """
    Returns {configuration: (n_acceptable, n_total, pct)} where 'acceptable'
    = verdict in ACCEPTABLE_FOR_QA. Mirrors the QA-reviewer criterion in §4.1.
    """
    by_cfg: Dict[str, List[str]] = {}
    for cid, v in rater.items():
        cfg = key.get(cid, {}).get("source_configuration", "UNKNOWN")
        by_cfg.setdefault(cfg, []).append(v)

    out = {}
    for cfg, verdicts in by_cfg.items():
        n_total = len(verdicts)
        n_ok = sum(1 for v in verdicts if v in ACCEPTABLE_FOR_QA)
        pct = 100.0 * n_ok / n_total if n_total else float("nan")
        out[cfg] = (n_ok, n_total, pct)
    return out


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def build_report(r1_path: Path, r2_path: Path, key_path: Path,
                 r1: Dict[str, str], r2: Dict[str, str],
                 key: Dict[str, Dict[str, str]]) -> str:
    case_ids = sorted(set(r1) & set(r2) & set(key))
    missing_in_r1 = sorted(set(key) - set(r1))
    missing_in_r2 = sorted(set(key) - set(r2))

    r1_aligned = [r1[c] for c in case_ids]
    r2_aligned = [r2[c] for c in case_ids]

    # --- Inter-rater
    kappa = cohen_kappa(r1_aligned, r2_aligned, VERDICTS)
    alpha = krippendorff_alpha_nominal([r1_aligned, r2_aligned], VERDICTS)

    # Try the third-party krippendorff library as a cross-check
    alpha_lib_note = ""
    try:
        import krippendorff  # type: ignore
        cat_to_int = {c: i for i, c in enumerate(VERDICTS)}
        as_int = [[cat_to_int[v] for v in r1_aligned],
                  [cat_to_int[v] for v in r2_aligned]]
        alpha_lib = krippendorff.alpha(reliability_data=as_int,
                                       level_of_measurement="nominal")
        alpha_lib_note = f" (krippendorff library cross-check: {alpha_lib:.3f})"
    except ImportError:
        alpha_lib_note = " (manual implementation; install `krippendorff` for cross-check)"

    # --- Per-rater acceptance by configuration
    acc1 = acceptance_by_configuration(r1, key)
    acc2 = acceptance_by_configuration(r2, key)

    # --- Rater vs LLM
    have_llm = [c for c in case_ids
                if key[c]["llm_judge_verdict"] not in NA_MARKERS
                and key[c]["llm_judge_verdict"] in VERDICTS]
    llm_aligned = [key[c]["llm_judge_verdict"] for c in have_llm]
    r1_for_llm = [r1[c] for c in have_llm]
    r2_for_llm = [r2[c] for c in have_llm]

    if have_llm:
        r1_vs_llm_agree = sum(1 for a, b in zip(r1_for_llm, llm_aligned) if a == b) / len(have_llm)
        r2_vs_llm_agree = sum(1 for a, b in zip(r2_for_llm, llm_aligned) if a == b) / len(have_llm)
        kappa_r1_llm = cohen_kappa(r1_for_llm, llm_aligned, VERDICTS)
        kappa_r2_llm = cohen_kappa(r2_for_llm, llm_aligned, VERDICTS)
    else:
        r1_vs_llm_agree = r2_vs_llm_agree = float("nan")
        kappa_r1_llm = kappa_r2_llm = float("nan")

    # --- Confusion matrices
    cm_r1_r2 = confusion_matrix(r1_aligned, r2_aligned, VERDICTS)
    cm_r1_llm = (confusion_matrix(r1_for_llm, llm_aligned, VERDICTS)
                 if have_llm else None)
    cm_r2_llm = (confusion_matrix(r2_for_llm, llm_aligned, VERDICTS)
                 if have_llm else None)

    # --- Landis & Koch interpretation
    def landis_koch(k: float) -> str:
        if np.isnan(k):
            return "n/a"
        if k < 0.20:
            return "poor"
        if k < 0.40:
            return "fair"
        if k < 0.60:
            return "moderate"
        if k < 0.80:
            return "substantial"
        return "almost perfect"

    # --- Build markdown
    out = []
    out.append("# Audit Analysis Results\n")
    out.append(f"- Rater 1 file: `{r1_path.name}` ({len(r1)} verdicts)\n"
               f"- Rater 2 file: `{r2_path.name}` ({len(r2)} verdicts)\n"
               f"- Key file: `{key_path.name}` ({len(key)} cases)\n"
               f"- Cases scored (intersection of all three): **{len(case_ids)}**\n")
    if missing_in_r1 or missing_in_r2:
        out.append(f"- Missing from rater 1: {missing_in_r1 or 'none'}")
        out.append(f"- Missing from rater 2: {missing_in_r2 or 'none'}\n")

    out.append("## Headline numbers\n")
    out.append(f"| Metric | Value | Interpretation (Landis & Koch 1977) |")
    out.append(f"|---|---:|---|")
    out.append(f"| Cohen's kappa (R1 vs R2) | **{kappa:.3f}** | {landis_koch(kappa)} |")
    out.append(f"| Krippendorff's alpha (R1 vs R2, nominal) | **{alpha:.3f}** |{alpha_lib_note} |")
    if have_llm:
        out.append(f"| R1 vs LLM judge agreement (raw) | {r1_vs_llm_agree*100:.1f}% | N = {len(have_llm)} |")
        out.append(f"| R2 vs LLM judge agreement (raw) | {r2_vs_llm_agree*100:.1f}% | N = {len(have_llm)} |")
        out.append(f"| Cohen's kappa (R1 vs LLM) | {kappa_r1_llm:.3f} | {landis_koch(kappa_r1_llm)} |")
        out.append(f"| Cohen's kappa (R2 vs LLM) | {kappa_r2_llm:.3f} | {landis_koch(kappa_r2_llm)} |")
    else:
        out.append(f"| R1/R2 vs LLM judge | n/a | LLM judge verdicts unavailable in KEY (likely seed-mismatch) |")
    out.append("")

    out.append("## Per-rater acceptance rate by source configuration\n")
    out.append("Acceptance = verdict in {accepted-as-is, minor-edit} (QA-reviewer criterion, §4.1).\n")
    out.append("| Configuration | R1: ok / total (%) | R2: ok / total (%) |")
    out.append("|---|---|---|")
    all_cfgs = sorted(set(list(acc1) + list(acc2)))
    for cfg in all_cfgs:
        a1 = acc1.get(cfg, (0, 0, float("nan")))
        a2 = acc2.get(cfg, (0, 0, float("nan")))
        out.append(f"| {cfg} | {a1[0]} / {a1[1]} ({a1[2]:.1f}%) | {a2[0]} / {a2[1]} ({a2[2]:.1f}%) |")
    out.append("")

    out.append("## Confusion matrix: Rater 1 vs Rater 2\n")
    out.append(cm_to_md(cm_r1_r2, VERDICTS, "R1", "R2"))
    out.append("")

    if cm_r1_llm is not None:
        out.append("## Confusion matrix: Rater 1 vs LLM judge\n")
        out.append(cm_to_md(cm_r1_llm, VERDICTS, "R1", "LLM"))
        out.append("")
        out.append("## Confusion matrix: Rater 2 vs LLM judge\n")
        out.append(cm_to_md(cm_r2_llm, VERDICTS, "R2", "LLM"))
        out.append("")

    # --- Distribution sanity check
    out.append("## Verdict distributions (sanity check)\n")
    def dist(verdicts):
        c = Counter(verdicts)
        total = sum(c.values())
        return ", ".join(f"{k}: {c.get(k,0)} ({100*c.get(k,0)/total:.0f}%)" for k in VERDICTS)
    out.append(f"- R1: {dist(r1_aligned)}")
    out.append(f"- R2: {dist(r2_aligned)}")
    if have_llm:
        out.append(f"- LLM: {dist(llm_aligned)}")
    out.append("")

    out.append("## Caveats\n")
    out.append("- **Sample size.** N = 25 cases is sufficient to detect "
               "substantial-or-better agreement (kappa >= 0.6) with one-sided alpha = 0.05 "
               "if the population rate is at or above moderate, but the 95% CI on kappa at "
               "this N is wide (rough rule of thumb: +/- 0.15). Treat point estimates accordingly.")
    out.append("- **Verdict imbalance.** If one bucket dominates the distribution "
               "(e.g., >85% accepted-as-is), kappa is highly sensitive to single-case "
               "disagreements (kappa paradox); report raw agreement alongside.")
    out.append("- **LLM-judge comparison.** Only cases for which the KEY carries a "
               "real (non-NA) llm_judge_verdict are included in the R1/R2-vs-LLM panel. "
               "If the audit packet was built from a seed for which the v2 judge was not "
               "executed, that panel will be 'n/a' and the audit only validates inter-rater "
               "reliability, not the human-vs-LLM circularity link.")
    out.append("- **One link in the chain.** This audit validates the *grading* step "
               "(rater-vs-LLM verdict). It does not validate category assignment or test-case "
               "generation; those remain same-model.")

    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rater1", required=True, type=Path)
    p.add_argument("--rater2", required=True, type=Path)
    p.add_argument("--key", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path,
                   help="Output markdown path (e.g. analysis_results.md)")
    args = p.parse_args()

    r1 = load_rater(args.rater1)
    r2 = load_rater(args.rater2)
    key = load_key(args.key)

    md = build_report(args.rater1, args.rater2, args.key, r1, r2, key)
    args.out.write_text(md, encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
