# Rater Instructions — Specification Enrichment Spot-Audit

**Time budget:** 60–120 minutes. Plan for one uninterrupted sitting.

**What you receive.** A markdown file with:

- The TodoMVC design (one page, public reference application — see https://todomvc.com).
- 11 black-box test cases, shuffled. Each test case has: a short title, preconditions, numbered steps, an expected outcome, and a category label.

**What you do not receive.** Which pipeline produced which test case. Do not try to infer; the question is whether each test case belongs in a shipping test plan, not whether it came from a particular system.

**Rating rubric (three buckets):**

| Verdict | Plain-English definition |
|---|---|
| **accepted-as-is** | I would add this test case to the shipping test plan today, exactly as written. Preconditions are concrete, steps are unambiguous, the expected outcome is something I could observe. |
| **minor-edit** | The test case is useful and tests the right thing, but needs a small textual fix before I would add it — for example, a missing precondition, an ambiguous expected-outcome phrasing, or a step that doesn't specify a parameter. The fix would take a junior QA engineer under 5 minutes. |
| **major-rework** | The test case is not usable as written. It is not testable, contradicts the design, or has no plausible relationship to what a TodoMVC-style application does. I would not salvage it in a triage meeting. |

**Method.**

1. Read the TodoMVC design once before rating any test case.
2. Rate each test case in the order shown. Do not skip ahead or revisit earlier ratings.
3. For each test case, write down the verdict in a column labeled "verdict" and a one-line reason in a column labeled "reason." The reason is for the audit record; it does not need to be long.
4. After rating all 11, total the count in each bucket.
5. Email the completed sheet to the audit coordinator. Do not discuss your ratings with the other rater until both sheets are submitted.

**What to ignore.**

- Whether the test case looks like it was written by a human or by an AI. Both kinds will be present; the question is the same in both cases.
- The category label on the test case. The label is descriptive context; it does not constrain your verdict.
- Style preferences (Gherkin vs. plain English, present tense vs. imperative). Rate the substance, not the format.

**What to flag if you see it.**

- A test case that depends on behavior the TodoMVC design clearly does not specify — this is the bias the audit is designed to detect. Mark major-rework and note "off-spec" in the reason column.
- A test case that duplicates another in the same sample. Mark minor-edit and note "duplicate of test-case-X."
- A test case that is internally contradictory (e.g., precondition contradicts expected outcome). Mark major-rework and note "contradictory."

Thank you for the time. Your ratings will appear in the final article as part of the published validation evidence.
