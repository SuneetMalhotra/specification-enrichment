# Evaluation results

This directory contains the empirical evaluation outputs cited in the article.

## Files

- `results_v1_strict_judge_2026-05-24.json` — the first-pass evaluation, in which the LLM-judge prompt was a strict spec-compliance checker. Produced an *inverted* result (baseline 82.2% accepted-as-is, enriched 50.0%). Preserved for audit and for the methodology-iteration discussion in §4.1.1 of the article.
- `results_v2_lenient_judge_2026-05-24.json` — the v2 evaluation, after revising the judge to evaluate as a QA reviewer for the application's category rather than a spec-compliance checker, and after removing meta-commentary from the design encoding. Cited as the headline result in §4.2.

## Why two result files

The v1 result was inverted from the expected direction. Inspection of the per-test-case grader reasons showed two methodology bugs:

1. The TodoMVC design encoding carried a `notes` field that explicitly called out the categories of implicit constraint the design omitted. The grader took this meta-commentary literally and marked off-spec tests as "design says this is out of scope, so this is wrong."
2. The grader prompt collapsed two different failure modes: contradicting the design (correctly major-rework) and covering implicit category-typical behavior (incorrectly major-rework).

Both bugs were fixed in v2. The article reports v2 numbers as the headline result and discusses v1 + the iteration explicitly in §4.1.1. The alternative — quietly throwing away the v1 result — is what a marketing-shaped paper would do.

## Reproducing

```
cd specification-enrichment
npm install
npm run harness:anthropic        # reproduces v2 numbers (uses current judge.ts)
```

The harness is deterministic at temperature 0. Same model version produces the same numbers; different model versions may produce slightly different absolute numbers (the qualitative direction of the coverage-expansion finding has been stable across the model versions tested).

To reproduce v1, check out the commit before the judge revision (see git log on `judge.ts` and `designs/todomvc.ts`) and run `npm run harness:anthropic` again.
