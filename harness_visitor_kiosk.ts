// harness_visitor_kiosk.ts — second-application replication harness.
//
// Runs three configurations against the synthetic Corporate Visitor
// Check-In Kiosk design (a non-public, non-memorized application) to
// validate that the headline finding from the TodoMVC evaluation does
// not depend on the model having seen the reference application during
// pretraining:
//
//   1. Baseline-16          design -> 16 test cases (no enrichment, no
//                           category-diversity instruction). Uses
//                           BASELINE_16_PROMPT from harness_count_matched.ts.
//
//   2. Baseline-16-Enhanced design -> 16 test cases with explicit
//                           category-diversity instruction. Uses
//                           BASELINE_16_ENHANCED_PROMPT from
//                           harness_enhanced_baseline.ts.
//
//   3. Enriched-16          design -> enrichment stage -> 16 test cases.
//                           Uses runEnrichedPipeline() from pipeline.ts.
//
// All three configurations are graded with the same two-ordering judge
// from judge.ts. Each stage is checkpointed (separately for the visitor
// kiosk under .harness-checkpoint-visitor-kiosk-*.json) so the run is
// resumable.
//
// Usage:
//   npx tsx harness_visitor_kiosk.ts
//

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ModelProvider } from './providers/types';
import { AnthropicProvider } from './providers/anthropic';
import { gradeTestCase, summarize, Grade, GradeSummary } from './judge';
import { generateBaseline, generateEnriched, TestCase } from './pipeline';
import { SpecificationEnricher } from './enricher';
import { VISITOR_KIOSK_DESIGN } from './designs/visitor_kiosk';
import { EnrichedSpec } from './types';

// --- Prompts duplicated verbatim from harness_count_matched.ts and
// harness_enhanced_baseline.ts so that this harness is self-contained
// and any future edits to those files cannot silently change the
// experimental conditions for the visitor-kiosk replication. ---

const BASELINE_16_PROMPT = `
You are a senior QA engineer. Given a design artifact, generate exactly 16
black-box test cases that cover the user-facing surface. Be thorough but do
not invent functionality the design does not specify. Each test case should
have an unambiguous, observable expected outcome.

Output JSON only, in this exact shape:

{
  "testCases": [
    {
      "id": "B1",
      "title": "<short imperative title>",
      "preconditions": ["<precondition>", ...],
      "steps": ["<step 1>", "<step 2>", ...],
      "expected": "<observable outcome>",
      "category": "happy-path | edge-case | error-handling | accessibility | persistence | other"
    }
  ]
}

Use ids B1, B2, ..., B16. Output exactly 16 test cases. No prose. No code fences. Output the JSON only.
`.trim();

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

// --- helpers ------------------------------------------------------------

const CATEGORY_KEYS = [
  'happy-path',
  'edge-case',
  'error-handling',
  'accessibility',
  'persistence',
  'internationalization',
  'other',
] as const;

type CategoryKey = (typeof CATEGORY_KEYS)[number];

function categoryDistribution(testCases: TestCase[]): Record<CategoryKey, number> {
  const dist: Record<CategoryKey, number> = {
    'happy-path': 0,
    'edge-case': 0,
    'error-handling': 0,
    accessibility: 0,
    persistence: 0,
    internationalization: 0,
    other: 0,
  };
  for (const tc of testCases) {
    const raw = (tc.category ?? 'other').trim();
    if ((CATEGORY_KEYS as readonly string[]).includes(raw)) {
      dist[raw as CategoryKey] += 1;
    } else {
      dist.other += 1;
    }
  }
  return dist;
}

function parseTestCasesJSON(raw: string): TestCase[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed);
  if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
    throw new Error('Response missing "testCases" array');
  }
  return parsed.testCases as TestCase[];
}

async function generateBaseline16(provider: ModelProvider): Promise<TestCase[]> {
  const design = VISITOR_KIOSK_DESIGN;
  const designText =
    typeof design.body === 'string' ? design.body : JSON.stringify(design.body, null, 2);
  const response = await provider.generate({
    system: BASELINE_16_PROMPT,
    user: `Design: ${design.name}\n\n${designText}`,
    responseFormat: 'json',
    temperature: 0,
  });
  return parseTestCasesJSON(response);
}

async function generateBaseline16Enhanced(provider: ModelProvider): Promise<TestCase[]> {
  const design = VISITOR_KIOSK_DESIGN;
  const designText =
    typeof design.body === 'string' ? design.body : JSON.stringify(design.body, null, 2);
  const response = await provider.generate({
    system: BASELINE_16_ENHANCED_PROMPT,
    user: `Design: ${design.name}\n\n${designText}`,
    responseFormat: 'json',
    temperature: 0,
  });
  return parseTestCasesJSON(response);
}

// --- checkpointing ------------------------------------------------------

// SEED is a label, not a knob. The model provider (claude -p) has no seed
// flag and GenerateOptions has no seed field. When SEED env var is set, we
// only suffix file paths so independent re-runs do not collide. Experimental
// conditions (prompts, temperature, model, judge) are unchanged.
const SEED_LABEL = process.env.SEED ? `_seed${process.env.SEED}` : '';

function cpPath(stage: string): string {
  return join(process.cwd(), `.harness-checkpoint-visitor-kiosk-${stage}${SEED_LABEL}.json`);
}

function loadCp<T>(stage: string): T | null {
  const p = cpPath(stage);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function saveCp(stage: string, data: unknown): void {
  writeFileSync(cpPath(stage), JSON.stringify(data, null, 2));
}

// --- grading loop with per-case checkpoint ------------------------------

async function gradeAllCheckpointed(
  provider: ModelProvider,
  testCases: TestCase[],
  label: string,
  checkpointKey: string,
  ts: () => string,
): Promise<Grade[]> {
  const design = VISITOR_KIOSK_DESIGN;
  const designForJudge = { id: design.id, name: design.name, body: design.body };
  const grades: Grade[] = loadCp<Grade[]>(checkpointKey) ?? [];
  const done = new Set(grades.map((g) => g.testCaseId));
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    if (done.has(tc.id)) {
      console.log(`  [${ts()}] [${label}] ${i + 1}/${testCases.length}: ${tc.id} (cached)`);
      continue;
    }
    console.log(`  [${ts()}] [${label}] ${i + 1}/${testCases.length}: ${tc.id}`);
    const g = await gradeTestCase(provider, designForJudge as never, tc);
    grades.push(g);
    saveCp(checkpointKey, grades);
  }
  return grades;
}

// --- main ---------------------------------------------------------------

interface ConfigResult {
  testCases: { id: string; title: string; category: string }[];
  grades: Grade[];
  summary: GradeSummary;
  categoryDistribution: Record<CategoryKey, number>;
}

async function main() {
  const provider = new AnthropicProvider({ model: 'claude-sonnet-4-6' });
  const startTime = Date.now();
  const ts = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
  const design = VISITOR_KIOSK_DESIGN;

  console.log(
    `\n=== harness_visitor_kiosk === provider=${provider.name} model=claude-sonnet-4-6 design=${design.name} seed=${process.env.SEED ?? '(unset)'}\n`,
  );

  // 1. Baseline-16
  console.log(`[${ts()}] Step 1/6: generate baseline-16 test cases...`);
  let baselineTC = loadCp<TestCase[]>('baseline16');
  if (baselineTC) {
    console.log(`  loaded baseline-16 from checkpoint (${baselineTC.length} cases)`);
  } else {
    baselineTC = await generateBaseline16(provider);
    saveCp('baseline16', baselineTC);
    console.log(`  [${ts()}] baseline-16 generated: ${baselineTC.length}`);
  }

  // 2. Enhanced-16
  console.log(`\n[${ts()}] Step 2/6: generate enhanced-16 test cases...`);
  let enhancedTC = loadCp<TestCase[]>('enhanced16');
  if (enhancedTC) {
    console.log(`  loaded enhanced-16 from checkpoint (${enhancedTC.length} cases)`);
  } else {
    enhancedTC = await generateBaseline16Enhanced(provider);
    saveCp('enhanced16', enhancedTC);
    console.log(`  [${ts()}] enhanced-16 generated: ${enhancedTC.length}`);
  }

  // 3. Enriched-16 (enrichment + generation)
  console.log(`\n[${ts()}] Step 3/6: enrichment stage + enriched-16 test cases...`);
  interface EnrichedCp {
    enriched: EnrichedSpec;
    testCases: TestCase[];
  }
  let enrichedCp = loadCp<EnrichedCp>('enriched16');
  let enriched: EnrichedSpec;
  let enrichedTC: TestCase[];
  if (enrichedCp) {
    enriched = enrichedCp.enriched;
    enrichedTC = enrichedCp.testCases;
    console.log(
      `  loaded enriched-16 from checkpoint: ${enriched.derivedConstraints.length} constraints, ${enrichedTC.length} test cases`,
    );
  } else {
    const enricher = new SpecificationEnricher({ provider, confidenceThreshold: 0.7 });
    enriched = await enricher.enrich(design);
    enrichedTC = await generateEnriched(provider, enriched);
    saveCp('enriched16', { enriched, testCases: enrichedTC });
    console.log(`  [${ts()}] derived constraints: ${enriched.derivedConstraints.length}`);
    console.log(`  [${ts()}] review questions:    ${enriched.reviewQuestions.length}`);
    console.log(`  [${ts()}] enriched test cases: ${enrichedTC.length}`);
  }

  // 4. Grade baseline-16
  console.log(`\n[${ts()}] Step 4/6: grade baseline-16 (N=${baselineTC.length})...`);
  const baselineGrades = await gradeAllCheckpointed(
    provider,
    baselineTC,
    'baseline16',
    'baseline16-grades',
    ts,
  );
  const baselineSummary = summarize(baselineGrades);

  // 5. Grade enhanced-16
  console.log(`\n[${ts()}] Step 5/6: grade enhanced-16 (N=${enhancedTC.length})...`);
  const enhancedGrades = await gradeAllCheckpointed(
    provider,
    enhancedTC,
    'enhanced16',
    'enhanced16-grades',
    ts,
  );
  const enhancedSummary = summarize(enhancedGrades);

  // 6. Grade enriched-16
  console.log(`\n[${ts()}] Step 6/6: grade enriched-16 (N=${enrichedTC.length})...`);
  const enrichedGrades = await gradeAllCheckpointed(
    provider,
    enrichedTC,
    'enriched16',
    'enriched16-grades',
    ts,
  );
  const enrichedSummary = summarize(enrichedGrades);

  const baseline: ConfigResult = {
    testCases: baselineTC.map((t) => ({ id: t.id, title: t.title, category: t.category ?? 'other' })),
    grades: baselineGrades,
    summary: baselineSummary,
    categoryDistribution: categoryDistribution(baselineTC),
  };

  const enhanced: ConfigResult = {
    testCases: enhancedTC.map((t) => ({ id: t.id, title: t.title, category: t.category ?? 'other' })),
    grades: enhancedGrades,
    summary: enhancedSummary,
    categoryDistribution: categoryDistribution(enhancedTC),
  };

  const enrichedOut: ConfigResult & {
    derivedConstraints: number;
    reviewQuestions: number;
  } = {
    derivedConstraints: enriched.derivedConstraints.length,
    reviewQuestions: enriched.reviewQuestions.length,
    testCases: enrichedTC.map((t) => ({ id: t.id, title: t.title, category: t.category ?? 'other' })),
    grades: enrichedGrades,
    summary: enrichedSummary,
    categoryDistribution: categoryDistribution(enrichedTC),
  };

  const out = {
    metadata: {
      timestamp: new Date().toISOString(),
      provider: provider.name,
      model: 'claude-sonnet-4-6',
      designId: design.id,
      designName: design.name,
      enricherVersion: enriched.metadata.enricherVersion,
      ablationNote:
        'Second-application replication of the Specification Enrichment evaluation. ' +
        'The reference application here is a synthetic Corporate Visitor Check-In Kiosk ' +
        'authored for this study — explicitly NOT a well-known public reference like TodoMVC ' +
        '— so the baseline pipeline cannot benefit from pretraining memorization of the ' +
        'application semantics. Three configurations are compared at N=16 test cases each: ' +
        '(1) Baseline-16 (no enrichment, no category-diversity instruction), ' +
        '(2) Baseline-16-Enhanced (no enrichment, explicit category-diversity instruction), ' +
        '(3) Enriched-16 (enrichment stage in front of generator). ' +
        'Prompts are byte-identical to harness_count_matched.ts and harness_enhanced_baseline.ts; ' +
        'judge is the same two-ordering conservative aggregator from judge.ts. ' +
        'Generation and grading are done with claude-sonnet-4-6 at temperature 0 via Claude OAuth (claude -p).',
    },
    baseline,
    enhanced,
    enriched: enrichedOut,
    delta: {
      baselineVsEnriched: {
        acceptedAsIsPctDelta: enrichedSummary.acceptedAsIsPct - baselineSummary.acceptedAsIsPct,
        minorEditPctDelta: enrichedSummary.minorEditPct - baselineSummary.minorEditPct,
        majorReworkPctDelta: enrichedSummary.majorReworkPct - baselineSummary.majorReworkPct,
      },
      enhancedVsEnriched: {
        acceptedAsIsPctDelta: enrichedSummary.acceptedAsIsPct - enhancedSummary.acceptedAsIsPct,
        minorEditPctDelta: enrichedSummary.minorEditPct - enhancedSummary.minorEditPct,
        majorReworkPctDelta: enrichedSummary.majorReworkPct - enhancedSummary.majorReworkPct,
      },
    },
  };

  const outPath = join(process.cwd(), 'results', `results_visitor_kiosk${SEED_LABEL}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nresults written to ${outPath}\n`);

  // --- headline tables ---
  const fmt = (n: number) => `${n.toFixed(1)}%`;
  const padR = (s: string, w: number) => s.padStart(w);

  console.log('=== VISITOR-KIOSK SUMMARY ===');
  console.log('                    baseline    enhanced    enriched');
  console.log(
    `accepted-as-is      ${padR(fmt(baselineSummary.acceptedAsIsPct), 8)}    ${padR(fmt(enhancedSummary.acceptedAsIsPct), 8)}    ${padR(fmt(enrichedSummary.acceptedAsIsPct), 8)}`,
  );
  console.log(
    `minor-edit          ${padR(fmt(baselineSummary.minorEditPct), 8)}    ${padR(fmt(enhancedSummary.minorEditPct), 8)}    ${padR(fmt(enrichedSummary.minorEditPct), 8)}`,
  );
  console.log(
    `major-rework        ${padR(fmt(baselineSummary.majorReworkPct), 8)}    ${padR(fmt(enhancedSummary.majorReworkPct), 8)}    ${padR(fmt(enrichedSummary.majorReworkPct), 8)}`,
  );
  console.log('');
  console.log(
    `N: baseline=${baselineSummary.total}, enhanced=${enhancedSummary.total}, enriched=${enrichedSummary.total}`,
  );
  console.log(
    `judge agreement: baseline=${fmt(baselineSummary.judgeAgreementPct)}, enhanced=${fmt(enhancedSummary.judgeAgreementPct)}, enriched=${fmt(enrichedSummary.judgeAgreementPct)}`,
  );

  console.log('\n=== CATEGORY DISTRIBUTION ===');
  const dists: Record<string, Record<CategoryKey, number>> = {
    baseline: baseline.categoryDistribution,
    enhanced: enhanced.categoryDistribution,
    enriched: enrichedOut.categoryDistribution,
  };
  console.log('                       baseline   enhanced   enriched');
  for (const cat of CATEGORY_KEYS) {
    console.log(
      `  ${cat.padEnd(20)} ${String(dists.baseline[cat]).padStart(7)}   ${String(dists.enhanced[cat]).padStart(7)}   ${String(dists.enriched[cat]).padStart(7)}`,
    );
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
