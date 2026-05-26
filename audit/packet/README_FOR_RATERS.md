# Rater Onboarding — LLM-Generated Test Case Spot-Audit

**Time budget:** 10–15 minutes for 25 test cases. Plan for one uninterrupted sitting.

## (a) What you are rating

Twenty-five black-box test cases for a generic **TodoMVC-style task-management web application**: a single-page todo list with add / edit / complete / delete / filter / clear-completed functionality. Public reference: <https://todomvc.com>. Each test case lists a title, preconditions, numbered steps, and an expected result.

All 25 test cases were authored by a large language model (Claude Sonnet 4.6, temperature 0). Your job is to judge each one *as a QA artifact*: would it earn a place in a shipping test plan?

## (b) Why

IEEE Software peer review flagged a "fully circular evaluation chain" in the original draft: the same model generated the test cases, assigned their categories, and graded their quality. Your independent verdicts break one link in that chain and produce a Cohen's κ / Krippendorff's α inter-rater agreement number that the published article will cite.

## (c) What you do *not* need to know

- **Which pipeline produced which test case.** The 25 cases come from three different generation pipelines (a baseline, an enhanced baseline, and an enriched pipeline). The mapping is sealed in the author's key and will not be revealed to you until after both raters' verdicts are returned. **Do not try to infer it.** The question is whether each test case belongs in the shipping test plan, not which system generated it.
- The original LLM-judge verdict on each test case. Also sealed.
- Anything about the article's hypothesis. Treat this as a blind QA review pass on an unknown vendor's test deliverable.

## (d) Rubric (verbatim from §4.1 of the article and `audit/protocol.md`)

The three buckets are unchanged from the LLM-judge rubric so that human and LLM verdicts are directly comparable.

| Verdict | Definition |
|---|---|
| **accepted-as-is** | Ready for the shipping test plan as written: concrete preconditions, observable expected outcome, clearly testable steps. I would add this to the plan today, unedited. |
| **minor-edit** | Useful and on-topic but needs a small textual fix — a missing precondition, an ambiguous expected-outcome phrasing, a step that does not specify a parameter. **Estimated fix: under 5 minutes by a junior QA engineer.** |
| **major-rework** | Not testable, contradicts the design, or has no plausible relationship to what a TodoMVC-style application does. Would not be salvaged in a triage meeting. |

Plain-English guidance, in priority order:

1. **Substance over style.** Rate the test, not the prose. Gherkin vs. plain English, present vs. imperative tense — ignore.
2. **Off-spec ≠ wrong.** A test case can probe behavior the TodoMVC reference does not explicitly specify (e.g., right-to-left text, persistence across reload, keyboard accessibility) and still be `accepted-as-is` if it is well-formed and the behavior is one a competent QA would expect from a production todo app. Off-spec only becomes `major-rework` when the test contradicts the design or has no plausible relationship to the app's behavior.
3. **Be honest about borderline cases.** Use `minor-edit` for genuinely-fixable defects; do not use it as a polite version of `accepted-as-is`.

## (e) How to record a verdict

1. Open `rater_template.csv` (provided alongside this README) in Excel, Numbers, or Google Sheets.
2. For each of the 25 rows (TC01–TC25), fill in:
   - `verdict` — exactly one of `accepted-as-is`, `minor-edit`, `major-rework` (lowercase, hyphenated, as shown).
   - `justification_2_sentences` — two sentences. Sentence 1: the verdict. Sentence 2: the single specific reason. Example for `minor-edit`: *"Steps clear, expected outcome verifiable. Precondition does not specify whether localStorage should be cleared before the run; trivial fix."*
   - `time_spent_minutes` — integer estimate; rough is fine.
3. Save the file as `rater_<your-initials>.csv` (e.g., `rater_AB.csv`).
4. Email it back to the author. Do not CC the other rater.

## (f) Estimated time

10–15 minutes total for 25 cases (≈ 30–40 seconds per case). The cases are short. If you find yourself spending more than 90 seconds on a single case, default to `minor-edit` and move on — the rubric distinguishes "ready" from "not ready," not "perfect" from "great."

## (g) What NOT to do

- **Do not Google individual test cases**, scrape the TodoMVC reference implementations on GitHub, or consult the published TodoMVC App Spec while rating. The verdict should reflect your own QA judgment, not a search result. (The whole point of the audit is to get independent human judgment; injecting search results re-introduces the circularity the audit is designed to break.)
- **Do not** discuss your verdicts with the other rater until both files are returned. Inter-rater agreement is meaningful only if the verdicts are independent.
- **Do not** skip ahead, revisit earlier ratings to "calibrate," or change a verdict after seeing a later case. Rate in order, in one pass.
- **Do not** try to identify which test came from which pipeline. Even a correct guess invalidates the blind.

## Questions

If anything in the rubric is ambiguous *before* you start, email the author. If anything is ambiguous *during* the rating pass, write the verdict you would assign with the rubric as written and flag the ambiguity in the `justification_2_sentences` column — that is itself useful data.

Thank you. Your initials and ratings will be acknowledged in the published article if you wish; tell the author when you return the file.
