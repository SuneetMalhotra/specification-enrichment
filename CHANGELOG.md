# Changelog

All notable changes to this project will be documented here.

## [1.0.0] - 2026-05-24

Initial release. Companion code for the article "Specification Enrichment: Using LLMs to Surface Implicit Constraints in Design-to-Test Pipelines" (Malhotra, 2026, IEEE Software — under review).

### Added
- `enricher.ts` — Specification Enrichment stage with confidence-thresholded promotion.
- `meta-prompt.ts` — three meta-prompt variants (default, terse, chain-of-thought).
- `pipeline.ts` — baseline and enriched test-case generators.
- `judge.ts` — LLM-as-judge grader with two-ordering position-bias guard and conservative aggregation.
- `harness.ts` — head-to-head evaluation entry point.
- `designs/todomvc.ts` — TodoMVC design encoded for the evaluation.
- `providers/stub.ts` — deterministic offline stub provider.
- `providers/anthropic.ts` — real provider that shells to `claude -p` (Claude Code OAuth; no API key).
- `examples/run-example.ts` — minimal end-to-end demo with the stub.
- `results/baseline_v1.0.0.json` — canonical reference result for the v1.0.0 evaluation.

## [Unreleased] - 2026-05-25

### Added
- `similarity.ts` — cosine-similarity merge predicate (§3.3 of the article); default τ=0.85.
- `providers/openai.ts` and `providers/gemini.ts` — stub providers for cross-model replication (§4.6); throw a clear error pointing at API-key configuration until implemented.

### Changed
- `enricher.merge` material-change predicate now uses cosine similarity over sentence embeddings (`similarity.ts`) by default; the prior token-level edit-distance predicate (30% threshold) is preserved as `EditDistanceMergePredicate` for deployments without embedding infrastructure.

### Notes
- The cosine-similarity ablation table across τ ∈ {0.75, 0.80, 0.85, 0.90} described in §3.3 of the article is TODO pending compute; the regeneration command is in `../audit/protocol.md` §4.
