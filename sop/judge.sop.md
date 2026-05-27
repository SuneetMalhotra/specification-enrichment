<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/qa_engineer.py — the
DebugError + WriteTest pattern. The judge in this repo grades the
QA stage's test-case output rather than re-running tests against
code, but the role shape (downstream reviewer of QA artifacts) is
the same. The SOP file is additive to the docstring in judge.ts.
-->

# Judge — SOP (QA-judge role)

Maps to: `judge.ts`.

## 1. Profile
I am the Judge. I grade a set of test cases against a rubric and emit
a structured grade per category. I do not modify the test cases.

## 2. Watched events
- A `TestCase[]` from `generateBaseline()` or `generateEnriched()`,
  together with the `DesignArtifact` they were generated from.
- (Reproducibility) one of the `.harness-checkpoint-*.json` files —
  the judge can re-grade prior runs without re-prompting.

## 3. State machine
1. **Read** the test cases and the design.
2. **Prompt** the configured model with the judge rubric.
3. **Parse** the grade response.
4. **Emit** a grade object covering per-category coverage, overall
   coverage, observability of assertions, and notes.

## 4. Produced artifact
A grade JSON written to `.harness-checkpoint-*-grades.json` and
consumed by the manuscript's evaluation tables.

## 5. Handoff
- To the manuscript's §6 tables.
- To the threshold-sweep harness for A/B comparison across
  `confidenceThreshold` values.

## 6. Failure modes & retry
- **Soft**: any grade outside the rubric's range — clamp and log.
- **Hard**: JSON parse failure — abort the grading pass; the upstream
  test cases are unaffected.

## Cross-reference to MetaGPT
MetaGPT's QA Engineer runs `WriteTest` then `DebugError` over generated
source code. The judge here is the analogue of `DebugError` applied to
test-case *specifications* rather than to source code. Both consume a
QA artifact and emit a structured judgment that the upstream role can
act on.
