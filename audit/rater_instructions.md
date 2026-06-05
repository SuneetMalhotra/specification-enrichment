# Rater Instructions — Specification Enrichment Spot-Audit

**Time budget:** 10–15 minutes for 25 test cases. Plan for one uninterrupted sitting.
**Canonical onboarding:** `packet/README_FOR_RATERS.md` is the full brief; this short-form companion must stay consistent with it.

**What you receive.**

- A short description of a generic **TodoMVC-style task-management web app** (add / edit / complete / delete / filter / clear-completed). Public reference: https://todomvc.com.
- **25 black-box test cases (TC01–TC25), shuffled**, in `packet/test_cases_blinded.csv`. Each has a title, preconditions, numbered steps, and an expected result. No category labels and no pipeline labels are shown.

**What you do not receive.** Which pipeline produced which test case, the test's category, or the original LLM-judge verdict — all sealed in the author key. Do not try to infer them; the only question is whether each test case belongs in a shipping test plan.

**Rating rubric (three buckets — identical to the LLM-judge rubric so verdicts are directly comparable):**

| Verdict | Plain-English definition |
|---|---|
| **accepted-as-is** | I would add this to the shipping test plan today, exactly as written. Concrete preconditions, unambiguous steps, an observable expected outcome. |
| **minor-edit** | Useful and on-topic, but needs a small textual fix first — a missing precondition, an ambiguous expected-outcome phrasing, or a step that doesn't specify a parameter. Under 5 minutes for a junior QA engineer. |
| **major-rework** | Not usable as written: not testable, contradicts the design, or has no plausible relationship to what a TodoMVC-style app does. I would not salvage it in triage. |

**Method.**

1. Read the app description once before rating any test case.
2. Rate each case in the order shown (TC01 → TC25). Don't skip ahead or revisit earlier ratings.
3. In `packet/rater_template.csv`, fill three columns per row: `verdict` (one of the three buckets), `justification_2_sentences` (a one-to-two-sentence reason), and `time_spent_minutes`.
4. After rating all 25, save the sheet.
5. Email the completed sheet to the audit coordinator. Do not discuss your ratings with the other rater until both sheets are in.

**Off-spec is not automatically wrong.** A test case may probe behavior the TodoMVC reference does not explicitly specify (persistence across reload, keyboard accessibility, right-to-left text, idle-session behavior). If it is well-formed and probes behavior a competent QA would expect from a production todo app, it can be **accepted-as-is**. Mark **major-rework** only when a test contradicts the design, is not testable, or has no plausible relationship to the app.

**What to ignore.**

- Whether a case looks human- or AI-written — the question is the same either way.
- Style preferences (Gherkin vs. plain English, tense). Rate substance, not format.

**What to flag (in the `justification_2_sentences` column).**

- A test that *contradicts* the design or is not testable → major-rework, note "off-spec/contradictory".
- A test that duplicates another in the sample → minor-edit, note "duplicate of TCxx".
- A test that is internally contradictory (precondition vs. expected outcome) → major-rework, note "contradictory".

Thank you for the time. Your ratings appear in the final article as published validation evidence.
