# Human Spot-Audit Protocol for Specification Enrichment Evaluation

**Purpose.** Bound the same-model self-evaluation bias risk identified in §5.1 of the article by validating a sample of LLM-as-judge verdicts against independent human raters. Required before the §4 acceptance-rate numbers can be cited as validation-scale evidence.

**Sample.** 20% of the total test-case judgments across the three configurations:

- Baseline-12: 12 test cases × 20% ≈ 3 test cases
- Baseline-16: 16 × 20% ≈ 4 test cases
- Enriched-16: 16 × 20% ≈ 4 test cases
- **Total: 11 test cases** sampled (round up to ensure ≥20% coverage in every configuration; use a fixed RNG seed for reproducibility — `numpy.random.default_rng(2026)`).

**Raters.** Two raters required. Neither rater is the author. Preferred profile: senior QA engineer or test architect with ≥5 years of test-plan review experience, no prior exposure to the article draft.

**Blinding procedure.**

1. The rater receives the design (TodoMVC) and the 11 sampled test cases shuffled into a single list, with all source-pipeline labels (Baseline-12 / Baseline-16 / Enriched-16) stripped.
2. The rater is shown the rubric (§4.1.2 of the article) verbatim, with no commentary about which pipeline produced which test case.
3. The rater rates each test case independently in a single sitting (target: 90 minutes; range: 60–120 minutes).
4. Raters do not communicate during the rating pass.

**Rubric** (verbatim from `judge.ts`, three-bucket):

- **accepted-as-is** — ready for the shipping test plan as written: concrete preconditions, observable expected outcome, clearly testable steps.
- **minor-edit** — useful and on-topic but needs a small textual fix (missing precondition, ambiguous expected-outcome phrasing, missing parameter on a step). Estimated fix: under 5 minutes by a junior QA.
- **major-rework** — not testable, contradicts the design, or has no plausible relationship to the application's user-facing behavior. Would not be salvaged in a triage meeting.

**Inter-rater reliability metric.** **Cohen's κ** computed on the two raters' verdicts treated as a categorical variable over {accepted-as-is, minor-edit, major-rework}.

Interpretation thresholds (Landis & Koch 1977):

- κ < 0.20 — poor; the LLM-as-judge numbers in §4 are not reliable; abort the cited claims.
- 0.20 ≤ κ < 0.40 — fair; report the disagreement and treat the §4 numbers as bounded estimates with explicit uncertainty.
- 0.40 ≤ κ < 0.60 — moderate; acceptable for a Practice column claim with an explicit κ disclosure.
- 0.60 ≤ κ < 0.80 — substantial; the §4 numbers can be cited as validation-scale evidence.
- κ ≥ 0.80 — almost perfect; the §4 numbers are robust.

**Comparison to LLM-as-judge.** For each of the 11 sampled test cases, compare the human-aggregated verdict (majority vote; ties broken toward the more lenient verdict) to the LLM-as-judge verdict already recorded in `results.json`. Report:

1. Per-configuration human-vs-LLM agreement rate.
2. Confusion matrix (3×3) of human verdict × LLM verdict.
3. Cohen's κ between human-aggregated and LLM-as-judge as a single number for the full sample.

**Output.** A markdown document `audit/results_YYYY-MM-DD.md` containing:

1. Date, rater identifiers (initials suffice if anonymity preferred), rating duration per rater.
2. The 11 sampled test-case IDs with each rater's verdict and the human-aggregated verdict.
3. Inter-rater κ (R1 vs R2) and human-vs-LLM κ (human-aggregate vs LLM).
4. Confusion matrix.
5. Recommendation on whether the §4 acceptance-rate numbers should be cited as validation-scale evidence.

**One-page rater instruction sheet.** See `audit/rater_instructions.md`.

---

## §4: Reproducibility — the exact regeneration commands the audit verifies

To regenerate the test-case bodies and the LLM-as-judge verdicts the human raters will check against:

```bash
cd companion-code
npm install
npm run harness:anthropic          # produces results.json with Baseline-12 and Enriched-16 plus judge verdicts
npx tsx harness_count_matched.ts   # produces results/results_baseline16_count_matched.json
npx tsx harness_threshold_sweep.ts # produces results/results_threshold_sweep.json (used by Fig. 1)
```

Each results file is keyed by test-case ID. The audit script in `audit/sample.py` (not yet written; one-line: `python3 -c "import json, numpy as np; rng=numpy.random.default_rng(2026); ids=...; print(rng.choice(ids, 11, replace=False))"`) selects the 11 sample IDs and writes `audit/sample_2026.json` listing exactly which test cases the raters will see.
