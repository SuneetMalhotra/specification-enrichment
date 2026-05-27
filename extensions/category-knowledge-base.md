<!--
SOURCE INSPIRATION: AutoDroid (https://github.com/MobileLLM/AutoDroid).
Specifically: the per-app memory directory in the repo, particularly
memory/app_state_summary.json (state-hash → short functional summary)
and memory/ex_mem.json (state-hash → previously-executed task path).
AutoDroid's central trick is that the model is not asked to derive
behaviour from scratch on every invocation — it retrieves from an
accumulated memory keyed by state.

The analogue for specification enrichment is a category-keyed
knowledge base of design conventions: the enricher should not have to
re-derive "todo apps usually persist across refresh" from the model's
training data on every call. It should look it up in a knowledge base
of conventions for the design's category, with a per-category set of
high-confidence constraints already vetted.

This is a DESIGN NOTE; enricher.ts and meta-prompt.ts are unchanged.
-->

# Extension proposal — category-keyed convention knowledge base

Status: design note, **not implemented**. `enricher.ts` and
`meta-prompt.ts` are unchanged.

## What `meta-prompt.ts` asks the model to do today

The current META_PROMPT (and META_PROMPT_COT, META_PROMPT_TERSE)
asks the model, for every enrichment call, to:
- enumerate the design's elements,
- guess implicit behaviour using six probes (empty input, long input,
  refresh, accessibility, locale, error states),
- assign confidence and produce a question if confidence is low.

The model derives the convention answer (e.g. "todo items persist
across refresh") from its pre-training. This works well for common
categories (todo apps, login forms, settings panes) and poorly for
uncommon categories (visitor kiosks, medical-device HMIs, industrial
control panels — the second public design in this repo is a visitor
kiosk and the manuscript notes uneven coverage).

## What AutoDroid does

AutoDroid maintains a per-app memory. The two relevant files are:

- `memory/app_state_summary.json` keys a state-hash to a one-sentence
  functional summary ("func: manage messenger settings and
  notifications"). The summaries are cheap to compute (one model
  call per new state) and they accumulate over time. At inference
  the model gets the summary instead of having to re-read the screen.

- `memory/ex_mem.json` keys a task hash to a previously-executed
  click path. Retrieval is by task-similarity (the `similar` field).
  At inference the model retrieves matching paths and plans from
  them rather than from scratch.

The combined effect is that prompt token count drops sharply once
the memory is warm, and behaviour stabilises across runs because the
model is choosing from a finite menu of known paths instead of
generating fresh ones.

## Proposed extension

Add a `categories/` knowledge base — one JSON file per design
category — that the enricher consults *before* prompting the model:

```
categories/
├── todo-app.json
├── kiosk.json
├── settings-pane.json
├── login-form.json
└── README.md
```

Each file has a stable schema:

```json
{
  "category": "todo-app",
  "knownConstraints": [
    {
      "id": "K-TODO-1",
      "description": "Todo items persist across browser refresh",
      "defaultConfidence": 0.85,
      "category": "persistence",
      "evidence": "Convention across TodoMVC implementations; user expectation since 2009."
    },
    {
      "id": "K-TODO-2",
      "description": "Pressing Enter on empty input does not create a task",
      "defaultConfidence": 0.90,
      "category": "validation",
      "evidence": "Standard TodoMVC behaviour."
    }
  ],
  "highVarianceQuestions": [
    {
      "id": "K-TODO-Q1",
      "question": "Are completed tasks visually distinct from active tasks (strikethrough, opacity)? Default: yes",
      "category": "accessibility",
      "priority": "high"
    }
  ],
  "metadata": {
    "version": "1.0",
    "lastReviewed": "2026-05-15",
    "reviewer": "human"
  }
}
```

The enricher's modified flow becomes:

1. **Classify** the incoming design's category (one model call, or
   from `design.metadata.category` if set).
2. **Retrieve** the matching `categories/<category>.json` if present.
3. **Pre-populate** `derivedConstraints` with the file's
   `knownConstraints` (subject to a stricter confidence floor than
   the LLM-derived ones, e.g. 0.8 versus 0.7).
4. **Pre-populate** `reviewQuestions` with the file's
   `highVarianceQuestions`.
5. **Call** the LLM with a constrained meta-prompt that says "the
   following constraints are already known; do not re-emit them; emit
   only constraints specific to this design that the knowledge base
   does not cover."
6. **Merge** the LLM-emitted constraints with the pre-populated set.

## What does NOT change

- `types.ts` types (`Constraint`, `ReviewQuestion`, `EnrichedSpec`)
  are unchanged.
- The merge predicate in `enricher.ts` is unchanged.
- The evaluation harness (`harness.ts`, `harness_threshold_sweep.ts`)
  is unchanged. The new code path is opt-in by passing a
  `categoryHint` to `enricher.enrich()`.

## What this buys

- **Token reduction**: the LLM no longer re-derives K conventions per
  category per call. For the TodoMVC design with K ≈ 6 known
  conventions, the meta-prompt output shrinks by ≈ 30 %.
- **Coverage for rare categories**: the visitor-kiosk design can have
  its own `categories/kiosk.json` curated by a human, raising the
  floor on coverage for a category the base model knows poorly.
- **Auditability**: the `evidence` field on every known constraint
  documents *why* it is a convention. This is the analogue of
  AutoDroid's `ex_mem.json` `similar` field — provenance of a piece
  of accumulated memory.

## What this risks

- **Knowledge-base drift**: if the convention changes (e.g. a new
  TodoMVC implementation breaks an old convention) the file rots.
  Mitigation: the `lastReviewed` metadata field + a CI check that
  flags files older than N months.
- **Category misclassification**: if step 1 picks the wrong category,
  the wrong knowledge base is loaded and the constraints applied are
  wrong-by-prior. Mitigation: route low-confidence classifications
  through the LLM without a knowledge base.
- **Over-fitting to known patterns**: the LLM stops looking for
  unusual constraints once the common ones are pre-filled.
  Mitigation: the constrained meta-prompt in step 5 explicitly asks
  for *novel* constraints.

## Why this is a design note and not an implementation

The published evaluation runs against two designs (TodoMVC,
visitor-kiosk). Building a knowledge base for two categories would
demonstrate the mechanism but the measurement would be trivial (one
classify-call per design). The mechanism becomes valuable when the
deployment runs against dozens of designs across a handful of
categories — the regime where AutoDroid's memory becomes the
performance-critical path. The published reference implementation
intentionally stays small and reproducible.

## Reading list

- AutoDroid memory layout: https://github.com/MobileLLM/AutoDroid/tree/main/memory
- AutoDroid paper: Wen et al., arXiv:2308.15272.
- The "Architect" analogue in `comparators/metagpt-style-roles.md`
  in this same repo — the knowledge base here is what an Architect
  role *would* have access to in a mature deployment.
