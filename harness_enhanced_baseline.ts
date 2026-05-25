// harness_enhanced_baseline.ts — "enhanced baseline" ablation.
//
// Runs a fourth configuration: N=16 baseline test cases generated with an
// explicit category-diversity instruction in the generation prompt. This is
// the experiment a sophisticated practitioner constructing a baseline today
// would build: "produce at least one accessibility test, one persistence
// test, one internationalization test, and one error-handling test."
//
// Compares against:
//   - Baseline-12  (original, no diversity instruction)
//   - Baseline-16  (count-matched, no diversity instruction)
//   - Enriched-16  (enrichment stage in front of generator)
//
// If Baseline-16-Enhanced closes the accessibility/persistence gap, the
// enrichment stage's contribution is "automatic category discovery" rather
// than "coverage expansion per se." If it does not close the gap, the
// structural claim of the article is validated. Either outcome is a real
// empirical finding.
//
// Usage:
//   npx tsx harness_enhanced_baseline.ts
//
// MIT License.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ModelProvider } from './providers/types';
import { AnthropicProvider } from './providers/anthropic';
import { gradeTestCase, summarize, Grade } from './judge';
import { TODOMVC_DESIGN } from './designs/todomvc';

interface TestCase {
  id: string;
  title: string;
  preconditions: string[];
  steps: string[];
  expected: string;
  category?: string;
}

const BASELINE_16_ENHANCED_PROMPT = `
You are a senior QA engineer. Given a design artifact, generate exactly 16
black-box test cases that cover the user-facing surface. Be thorough but do
not invent functionality the design does not specify. Each test case should
have an unambiguous, observable expected outcome.

The test plan should include adequate coverage across the following test
categories, applied where relevant to the design under test:
  - At least one accessibility test (keyboard navigation, screen-reader
    semantics, or contrast).
  - At least one persistence test (behavior across browser refresh or app
    restart).
  - At least one internationalization test (locale-dependent behavior such
    as date formatting, currency, or right-to-left text), where applicable
    to the design.
  - At least one error-handling test (boundary input, invalid input, or
    failure-mode behavior).
  - Adequate happy-path and edge-case coverage for the explicit user
    flows in the design.

Output JSON only, in this exact shape:

{
  "testCases": [
    {
      "id": "E1",
      "title": "<short imperative title>",
      "preconditions": ["<precondition>", ...],
      "steps": ["<step 1>", "<step 2>", ...],
      "expected": "<observable outcome>",
      "category": "happy-path | edge-case | error-handling | accessibility | persistence | other"
    }
  ]
}

Use ids E1, E2, ..., E16. Output exactly 16 test cases. No prose. No code fences. Output the JSON only.
`.trim();

async function generateBaseline16Enhanced(provider: ModelProvider): Promise<TestCase[]> {
  const design = TODOMVC_DESIGN;
  const designText =
    typeof design.body === 'string' ? design.body : JSON.stringify(design.body, null, 2);

  const response = await provider.generate({
    system: BASELINE_16_ENHANCED_PROMPT,
    user: `Design: ${design.name}\n\n${designText}`,
    responseFormat: 'json',
    temperature: 0,
  });

  const trimmed = response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed);
  return parsed.testCases as TestCase[];
}

function loadGrades(): Grade[] {
  const p = join(process.cwd(), '.harness-checkpoint-baseline16enhanced-grades.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  return [];
}

function saveGrades(g: Grade[]): void {
  const p = join(process.cwd(), '.harness-checkpoint-baseline16enhanced-grades.json');
  writeFileSync(p, JSON.stringify(g, null, 2));
}

function loadTC(): TestCase[] | null {
  const p = join(process.cwd(), '.harness-checkpoint-baseline16enhanced.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  return null;
}

function saveTC(t: TestCase[]): void {
  const p = join(process.cwd(), '.harness-checkpoint-baseline16enhanced.json');
  writeFileSync(p, JSON.stringify(t, null, 2));
}

async function main() {
  const provider = new AnthropicProvider({ model: 'claude-sonnet-4-6' });
  const startTime = Date.now();
  const ts = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

  console.log(`\n=== enhanced baseline (N=16 with category-diversity instruction) ===\n`);

  let tc = loadTC();
  if (tc) {
    console.log(`[${ts()}] loaded baseline16enhanced from checkpoint (${tc.length} cases)`);
  } else {
    console.log(`[${ts()}] generating 16 enhanced-baseline test cases...`);
    tc = await generateBaseline16Enhanced(provider);
    saveTC(tc);
    console.log(`[${ts()}] generated ${tc.length} test cases`);
  }

  console.log(`\n[${ts()}] grading baseline-16-enhanced test cases...`);
  const grades = loadGrades();
  const done = new Set(grades.map((g) => g.testCaseId));

  for (let i = 0; i < tc.length; i++) {
    const t = tc[i];
    if (done.has(t.id)) {
      console.log(`  [${ts()}] ${i + 1}/${tc.length}: ${t.id} (cached)`);
      continue;
    }
    console.log(`  [${ts()}] ${i + 1}/${tc.length}: ${t.id}`);
    const designForJudge = { id: TODOMVC_DESIGN.id, name: TODOMVC_DESIGN.name, body: TODOMVC_DESIGN.body };
    const g = await gradeTestCase(provider, designForJudge as never, t);
    grades.push(g);
    saveGrades(grades);
  }

  const summary = summarize(grades);

  const out = {
    metadata: {
      timestamp: new Date().toISOString(),
      provider: provider.name,
      model: 'claude-sonnet-4-6',
      designId: TODOMVC_DESIGN.id,
      designName: TODOMVC_DESIGN.name,
      ablationNote:
        'Enhanced baseline at N=16, generated with the same baseline prompt as the N=16 count-matched harness PLUS an explicit category-diversity instruction (at least one accessibility test, one persistence test, one internationalization test, one error-handling test). Tests the hypothesis that an informed practitioner could close the category-coverage gap by hand-coding the categories the enrichment stage discovers automatically.',
    },
    testCases: tc.map((t) => ({ id: t.id, title: t.title, category: t.category ?? 'other' })),
    grades,
    summary,
  };

  const outPath = join(process.cwd(), 'results', 'results_baseline16_enhanced.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nresults written to ${outPath}\n`);

  const fmt = (n: number) => `${n.toFixed(1)}%`;
  console.log('=== BASELINE-16-ENHANCED SUMMARY ===');
  console.log(`accepted-as-is: ${fmt(summary.acceptedAsIsPct)} (${summary.acceptedAsIs}/${summary.total})`);
  console.log(`minor-edit:     ${fmt(summary.minorEditPct)} (${summary.minorEdit}/${summary.total})`);
  console.log(`major-rework:   ${fmt(summary.majorReworkPct)} (${summary.majorRework}/${summary.total})`);
  console.log(`judge agreement: ${fmt(summary.judgeAgreementPct)}`);

  console.log('\n=== CATEGORY DISTRIBUTION ===');
  const cats: Record<string, number> = {};
  for (const t of tc) {
    const c = t.category ?? 'other';
    cats[c] = (cats[c] || 0) + 1;
  }
  for (const [c, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}: ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
