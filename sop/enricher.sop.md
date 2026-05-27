<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/role.py (Role base class)
and metagpt/roles/architect.py (the Architect role). MetaGPT encodes
each role as a one-page contract: profile, watched actions, produced
actions, failure modes. The enricher in this repo is the closest thing
to MetaGPT's Architect role (see comparators/metagpt-style-roles.md
for the full mapping). This file documents the enricher in the same
SOP shape, additive to the README and the docstring in enricher.ts.
-->

# Enricher — SOP (Architect-equivalent role)

Maps to: `enricher.ts` (`SpecificationEnricher`).

## 1. Profile
I am the Enricher. I read a software design artifact and surface
constraints the design assumes but does not explicitly state.
High-confidence constraints become silent additions to the spec;
low-confidence constraints become questions for the design owner.

## 2. Watched events
- A `DesignArtifact` passed to `SpecificationEnricher.enrich()`.
- (Production / dialogue-mode) a `Map<constraintId, answer>` passed to
  `SpecificationEnricher.merge()` after the design owner answers the
  review questionnaire.

## 3. State machine

### `enrich(design)`
1. **Format** the design — `formatDesign()` flattens
   `DesignArtifact.body` (string or JSON) to a single prompt input.
2. **Prompt** the configured model with `META_PROMPT` (or a variant)
   in `meta-prompt.ts`.
3. **Parse** the JSON response into a `Constraint[]`. Reject and
   abort on parse failure (no silent fallback).
4. **Partition** by `confidence` against `confidenceThreshold`
   (default 0.7):
   - `confidence ≥ threshold` → `derivedConstraints`
   - `confidence < threshold` → `reviewQuestions` (priority `high`
     if `confidence < 0.4`, else `low`)
5. **Emit** `EnrichedSpec` with `metadata` carrying the enricher
   version, model provider name, ISO timestamp, and the threshold
   used.

### `merge(enriched, answers)`
1. For each `ReviewQuestion`, if the answers map carries an entry for
   its `constraintId`, promote it to a constraint with
   `category: "reviewer-confirmed"` and `confidence: 1.0`.
2. Otherwise, leave the question in the residual queue.
3. Emit a new `EnrichedSpec` with the updated constraint list and
   the unanswered questions retained.

## 4. Produced artifact
`EnrichedSpec` per `types.ts`. Two production paths:
- The constraint list feeds `generateEnriched()` in `pipeline.ts`,
  which produces the 16 test cases of the enriched arm.
- The review-question list feeds the questionnaire channel (today: a
  static dump; with the extension in
  `extensions/dialogue-mode-questionnaire.md`: a multi-turn
  dialogue).

## 5. Handoff
- To `generateEnriched()` (downstream QA stage).
- To `judge.ts` (downstream grading).
- To the audit packets under `audit/packet/`.

## 6. Failure modes & retry
- **Soft**: confidence values outside [0,1] or category outside the
  fixed enum — `enricher.ts` coerces to the nearest valid value.
- **Hard**: response is not JSON — `parseResponse()` throws and the
  caller decides whether to retry. No silent fallback to an empty
  `EnrichedSpec`.
- **Hard**: any constraint missing the required fields (`id`,
  `description`, `confidence`, `justification`, `category`) — throw.

## Cross-reference to MetaGPT
The MetaGPT Architect role (`metagpt/roles/architect.py`) consumes
the PM's PRD and produces structural design + API spec. The Enricher
here consumes a `DesignArtifact` and produces a structural
specification (the constraint set). The shape is identical; the
substrate is different.

The MetaGPT Architect runs in `react_mode = BY_ORDER` over the
`WriteDesign` action; the Enricher is a pure function with one model
call. The harness's choice mirrors the manuscript's evaluation
contract: the enrichment effect must be measured per call, not per
multi-call rollout, so the Enricher is deliberately stateless.

## Cross-reference to the Article 2 companion
The Article 2 harness (`agent-harness` repo) has a five-role pipeline
where the Enricher's analogue is the *PM agent* — it converts the
upstream artifact into a structured spec for the QA agent. The two
repos collectively cover the PM → Architect → QA chain: this repo is
the Architect, the companion repo is the PM and the QA.
