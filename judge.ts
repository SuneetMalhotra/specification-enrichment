// judge.ts — LLM-as-judge grader for the empirical evaluation.
//
// The judge reads one test case at a time and rates it on the same 3-bucket
// rubric a human reviewer would use:
//   - accepted-as-is:    ready to add to the test plan
//   - minor-edit:        useful but needs small wording/precondition fixes
//   - major-rework:      misses the point, contradicts the design, or is unclear
//
// The judge is run twice per test case with reordered options to detect
// position bias; a test case is recorded as accepted-as-is only when both
// runs agree at that level. This is a documented, simple guard.
//
// We disclose this methodology explicitly in the article and reproduce the
// raw grades in results.json for inspection. The judge prompt is content-
// addressed and pinned so grades are reproducible.
//

import { ModelProvider } from './providers/types';
import { DesignArtifact } from './types';
import { TestCase } from './pipeline';

export type Verdict = 'accepted-as-is' | 'minor-edit' | 'major-rework';

export interface Grade {
  testCaseId: string;
  verdict: Verdict;
  reason: string;
  rawRun1: Verdict;
  rawRun2: Verdict;
  agreed: boolean;
}

const JUDGE_PROMPT_TEMPLATE = (orderedOptions: string[]) => `
You are an expert QA reviewer evaluating a single black-box test case for a
real-world software application. You have the application's design and the
test case. Rate the test case on a 3-bucket rubric based on whether you
would accept it into the test plan for shipping this kind of application:

${orderedOptions.join('\n')}

Important: real-world applications have implicit behaviors that designs
routinely omit (persistence, accessibility, edge cases, error handling,
internationalization). A useful test case may cover an implicit behavior
that the design does not explicitly state, provided the behavior is
consistent with the application category and would be expected of a
production implementation. Only mark such tests as "major-rework" if they
contradict the design or test functionality clearly outside the application
category.

If the test case is generally fine but its expected outcome is vague,
unobservable, or its preconditions are missing, that is "minor-edit".
Only use "major-rework" if the test case is fundamentally flawed: not
testable, contradicts the design, or has no plausible relationship to the
application's user-facing behavior.

Output JSON only, in this exact shape:

{
  "verdict": "<one of the three labels>",
  "reason": "<one sentence>"
}

No prose. No code fences. Output the JSON only.
`.trim();

const OPTIONS_ORDER_1 = [
  '1. accepted-as-is — would add to the test plan without modification',
  '2. minor-edit — useful test case, needs a small wording or precondition fix',
  '3. major-rework — not testable, contradicts the design, or has no plausible relationship to the application',
];

const OPTIONS_ORDER_2 = [
  '1. major-rework — not testable, contradicts the design, or has no plausible relationship to the application',
  '2. minor-edit — useful test case, needs a small wording or precondition fix',
  '3. accepted-as-is — would add to the test plan without modification',
];

function parseVerdict(raw: string): { verdict: Verdict; reason: string } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed);
  const v = String(parsed.verdict || '').trim();
  if (v !== 'accepted-as-is' && v !== 'minor-edit' && v !== 'major-rework') {
    throw new Error(`Unexpected verdict: ${v}`);
  }
  return { verdict: v as Verdict, reason: String(parsed.reason ?? '').trim() };
}

function formatTestCase(design: DesignArtifact, tc: TestCase): string {
  const designText =
    typeof design.body === 'string'
      ? design.body
      : JSON.stringify(design.body, null, 2);

  return [
    `DESIGN: ${design.name}`,
    designText,
    '',
    `TEST CASE [${tc.id}]: ${tc.title}`,
    `Preconditions: ${(tc.preconditions ?? []).join('; ') || '(none)'}`,
    `Steps:`,
    ...(tc.steps ?? []).map((s, i) => `  ${i + 1}. ${s}`),
    `Expected: ${tc.expected}`,
    `Category: ${tc.category ?? 'other'}`,
  ].join('\n');
}

export async function gradeTestCase(
  provider: ModelProvider,
  design: DesignArtifact,
  tc: TestCase,
): Promise<Grade> {
  const user = formatTestCase(design, tc);

  const [r1, r2] = await Promise.all([
    provider.generate({
      system: JUDGE_PROMPT_TEMPLATE(OPTIONS_ORDER_1),
      user,
      responseFormat: 'json',
      temperature: 0,
    }),
    provider.generate({
      system: JUDGE_PROMPT_TEMPLATE(OPTIONS_ORDER_2),
      user,
      responseFormat: 'json',
      temperature: 0,
    }),
  ]);

  const p1 = parseVerdict(r1);
  const p2 = parseVerdict(r2);
  const agreed = p1.verdict === p2.verdict;

  // Conservative aggregation: if runs disagree, take the WORSE of the two.
  // This prevents position bias from inflating the accepted-as-is rate.
  const order: Record<Verdict, number> = {
    'accepted-as-is': 0,
    'minor-edit': 1,
    'major-rework': 2,
  };
  const worse: Verdict =
    order[p1.verdict] >= order[p2.verdict] ? p1.verdict : p2.verdict;

  return {
    testCaseId: tc.id,
    verdict: worse,
    reason: agreed ? p1.reason : `disagreement; conservative aggregate: ${p1.reason} | ${p2.reason}`,
    rawRun1: p1.verdict,
    rawRun2: p2.verdict,
    agreed,
  };
}

export interface GradeSummary {
  total: number;
  acceptedAsIs: number;
  minorEdit: number;
  majorRework: number;
  acceptedAsIsPct: number;
  minorEditPct: number;
  majorReworkPct: number;
  judgeAgreementPct: number;
}

export function summarize(grades: Grade[]): GradeSummary {
  const total = grades.length;
  const acc = grades.filter((g) => g.verdict === 'accepted-as-is').length;
  const min = grades.filter((g) => g.verdict === 'minor-edit').length;
  const maj = grades.filter((g) => g.verdict === 'major-rework').length;
  const agreed = grades.filter((g) => g.agreed).length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return {
    total,
    acceptedAsIs: acc,
    minorEdit: min,
    majorRework: maj,
    acceptedAsIsPct: pct(acc),
    minorEditPct: pct(min),
    majorReworkPct: pct(maj),
    judgeAgreementPct: pct(agreed),
  };
}
