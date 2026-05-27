<!--
SOURCE INSPIRATION: MetaGPT (https://github.com/geekan/MetaGPT).
Specifically: metagpt/roles/product_manager.py, architect.py,
qa_engineer.py and the Role base class in metagpt/roles/role.py.
MetaGPT's central claim is "Code = SOP(Team)": a multi-agent pipeline
is the materialised form of a Standard Operating Procedure across
roles. The specification-enrichment pipeline in this repo is a
two-and-a-half-role analogue of that same shape.
-->

# Comparator note — MetaGPT-style role mapping

This document maps the specification-enrichment pipeline onto
MetaGPT's PM / Architect / QA role triple. The mapping is approximate
(MetaGPT operates over a full software-construction SOP; this repo
operates over a small spec-to-test SOP), but the analogy clarifies
what each component in this repo is *for*.

## The MetaGPT canonical pipeline

| MetaGPT role | Watched action | Produces |
| --- | --- | --- |
| Product Manager | `UserRequirement` | `PRD` (`WritePRD` action) |
| Architect | `WritePRD` | system design + API spec (`WriteDesign`) |
| Project Manager | `WriteDesign` | task list (`WriteTasks`) |
| Engineer | `WriteTasks` | source files (`WriteCode`) |
| QA Engineer | `WriteCode` | unit tests + bug reports (`WriteTest`, `DebugError`) |

## The specification-enrichment pipeline

The pipeline in `pipeline.ts` has three stages with a shared design
artifact at the head:

```
DesignArtifact  ──►  generateBaseline()         ──►  TestCase[] (B1..B12)
DesignArtifact  ──►  SpecificationEnricher      ──►  EnrichedSpec
EnrichedSpec    ──►  generateEnriched()         ──►  TestCase[] (E1..E16)
```

## Role mapping

| MetaGPT role | Component in this repo | Justification |
| --- | --- | --- |
| Product Manager | The author of `DesignArtifact` (i.e. the human design owner, or `designs/todomvc.ts` / `designs/visitor_kiosk.ts` for the published runs) | Both produce the upstream artifact that everything else consumes. The repo treats the design as fixed input, the way MetaGPT treats a user requirement as fixed input. |
| Architect | `enricher.ts` (`SpecificationEnricher`) | The Architect's job is to expand a high-level spec into the structural and behavioural constraints that downstream roles need. Enrichment does exactly this — it surfaces persistence, accessibility, validation, and error-handling constraints the design did not state. |
| QA Engineer | `pipeline.ts` (`generateBaseline` and `generateEnriched`) | Both consume a structural spec and emit test cases. The two-arm A/B in `pipeline.ts` is exactly an ablation on whether the QA stage receives the Architect's output (`generateEnriched`) or the raw user requirement (`generateBaseline`). |
| QA Judge | `judge.ts` | Closest analogue is MetaGPT's `DebugError` action — a downstream review of QA output. The judge in this repo grades test cases by category coverage and observability; MetaGPT's debug step finds errors in generated code. The shape (reviewer of QA artifacts) is the same; the substrate is different. |
| Project Manager | (no analogue) | The repo runs only the spec-to-test segment; there is no source-code-construction phase, so no project-management hand-off is needed. The Article 2 companion (`agent-harness`) is where the full PM / QA / Engineer / Reviewer chain lives. |

## Worked example — TodoMVC

| Stage | MetaGPT canonical | This repo (TodoMVC) |
| --- | --- | --- |
| Input | "Build a TodoMVC app." | `designs/todomvc.ts` (DesignArtifact with screens + components) |
| PM output | PRD listing user actions, acceptance criteria | The DesignArtifact itself is the input; no separate PRD step |
| Architect output | API spec, data model, system design | `EnrichedSpec` with derivedConstraints `{ persistence, accessibility, validation, error-handling, ... }` and `reviewQuestions` for low-confidence cases |
| QA output | 12 unit tests covering the API | 12 baseline test cases (`generateBaseline`) and/or 16 enriched test cases (`generateEnriched`) |
| Judge output | Bug reports on the generated code | `judge.ts` grades on category coverage |

## Where the analogy breaks down

- **No multi-file output.** MetaGPT's Engineer composes a multi-file
  project; this repo never generates source code, only test-case
  *specifications*. The Article 2 companion fills this gap.
- **No state machine.** MetaGPT roles have `react_mode` ∈ {REACT,
  BY_ORDER, PLAN_AND_ACT}; this repo's stages are pure functions
  with a single LLM call each. The simpler shape is intentional —
  the repo's purpose is to evaluate the *enrichment effect*, not to
  demonstrate complex orchestration.
- **No shared environment.** MetaGPT roles communicate via a shared
  `Environment.memory`; this repo passes typed objects through
  function arguments. The substrate analogue in this repo is the
  checkpoint files (`.harness-checkpoint-*.json`) the harness writes
  for reproducibility.

## Why this mapping matters

The mapping clarifies that the *Architect* role is the missing piece
in design-to-test pipelines without enrichment. The baseline arm of
this repo's evaluation is exactly the "PM → QA" hop with no Architect
in between; the enriched arm inserts the Architect (the enricher) and
measures the effect.

In MetaGPT's framing, removing the Architect from the standard SOP
costs you the structural design that the Engineer and QA both need.
This repo's empirical contribution is to measure that cost in the
spec-to-test setting: it is the test-case count delta + the category
coverage delta + the LLM-judge grade delta between the two arms.

## Reading list

- MetaGPT roles: https://github.com/geekan/MetaGPT/tree/main/metagpt/roles
- MetaGPT Role base class: `metagpt/roles/role.py`
- MetaGPT paper: Hong et al., "MetaGPT: Meta Programming for a
  Multi-Agent Collaborative Framework," arXiv:2308.00352.
