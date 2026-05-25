// harness.ts — the head-to-head empirical evaluation.
//
// Runs the baseline pipeline (design -> test cases) and the enriched pipeline
// (design -> enrichment -> test cases) on the same design artifact, grades
// every generated test case with the LLM-judge, and writes a results.json
// with per-test-case grades plus aggregate summaries.
//
// Usage:
//   npx tsx harness.ts
//   npx tsx harness.ts --provider stub      # offline run, deterministic
//   npx tsx harness.ts --provider anthropic # uses claude -p OAuth
//
// MIT License.

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelProvider } from './providers/types';
import { StubProvider } from './providers/stub';
import { AnthropicProvider } from './providers/anthropic';
import { generateBaseline, runEnrichedPipeline, TestCase } from './pipeline';
import { gradeTestCase, summarize, Grade } from './judge';
import { TODOMVC_DESIGN } from './designs/todomvc';
import { EnrichedSpec } from './types';

interface HarnessResults {
  metadata: {
    timestamp: string;
    provider: string;
    model: string | null;
    designId: string;
    designName: string;
    enricherVersion: string;
    methodologyNote: string;
  };
  baseline: {
    testCases: ReturnType<typeof testCaseSnapshot>[];
    grades: Grade[];
    summary: ReturnType<typeof summarize>;
  };
  enriched: {
    derivedConstraints: number;
    reviewQuestions: number;
    testCases: ReturnType<typeof testCaseSnapshot>[];
    grades: Grade[];
    summary: ReturnType<typeof summarize>;
  };
  delta: {
    acceptedAsIsPctDelta: number;
    minorEditPctDelta: number;
    majorReworkPctDelta: number;
  };
}

function testCaseSnapshot(tc: { id: string; title: string; category?: string }) {
  return { id: tc.id, title: tc.title, category: tc.category ?? 'other' };
}

function pickProvider(arg: string | undefined): { provider: ModelProvider; model: string | null } {
  if (arg === 'stub' || arg === undefined) {
    return { provider: new StubProvider(), model: null };
  }
  if (arg === 'anthropic') {
    return { provider: new AnthropicProvider({ model: 'claude-sonnet-4-6' }), model: 'claude-sonnet-4-6' };
  }
  throw new Error(`Unknown provider: ${arg}. Use 'stub' or 'anthropic'.`);
}

async function gradeAll(
  provider: ModelProvider,
  designId: string,
  designName: string,
  testCases: { id: string; title: string; preconditions: string[]; steps: string[]; expected: string; category?: string }[],
  label: string,
): Promise<Grade[]> {
  const grades: Grade[] = [];
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    process.stdout.write(`  [${label}] grading ${i + 1}/${testCases.length}: ${tc.id}\n`);
    const g = await gradeTestCase(provider, { id: designId, name: designName, body: '' } as never, tc);
    grades.push(g);
  }
  return grades;
}

function checkpointPath(stage: string): string {
  return join(process.cwd(), `.harness-checkpoint-${stage}.json`);
}

function loadCheckpoint<T>(stage: string): T | null {
  const p = checkpointPath(stage);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function saveCheckpoint(stage: string, data: unknown): void {
  writeFileSync(checkpointPath(stage), JSON.stringify(data, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const providerArg = argv.includes('--provider')
    ? argv[argv.indexOf('--provider') + 1]
    : 'stub';
  const { provider, model } = pickProvider(providerArg);
  const startTime = Date.now();
  const ts = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

  const design = TODOMVC_DESIGN;
  const designForJudge = { id: design.id, name: design.name, body: design.body };

  console.log(`\n=== harness === provider=${provider.name} model=${model ?? '(n/a)'} design=${design.name}\n`);

  // 1. Baseline pipeline (checkpointed)
  console.log(`[${ts()}] Step 1/4: generate baseline test cases...`);
  let baselineTC: TestCase[] | null = loadCheckpoint<TestCase[]>('baseline');
  if (baselineTC) {
    console.log(`  loaded baseline test cases from checkpoint: ${baselineTC.length}`);
  } else {
    baselineTC = await generateBaseline(provider, design);
    saveCheckpoint('baseline', baselineTC);
    console.log(`  [${ts()}] baseline test cases generated: ${baselineTC.length}`);
  }

  // 2. Enriched pipeline (checkpointed)
  console.log(`\n[${ts()}] Step 2/4: enrich + generate enriched test cases...`);
  interface EnrichedCheckpoint { enriched: EnrichedSpec; testCases: TestCase[]; }
  const enrichedCp = loadCheckpoint<EnrichedCheckpoint>('enriched');
  let enriched: EnrichedSpec;
  let enrichedTC: TestCase[];
  if (enrichedCp) {
    enriched = enrichedCp.enriched;
    enrichedTC = enrichedCp.testCases;
    console.log(`  loaded enriched checkpoint: ${enriched.derivedConstraints.length} constraints, ${enrichedTC.length} test cases`);
  } else {
    const result = await runEnrichedPipeline(provider, design, 0.7);
    enriched = result.enriched;
    enrichedTC = result.testCases;
    saveCheckpoint('enriched', { enriched, testCases: enrichedTC });
    console.log(`  [${ts()}] derived constraints: ${enriched.derivedConstraints.length}`);
    console.log(`  [${ts()}] review questions:    ${enriched.reviewQuestions.length}`);
    console.log(`  [${ts()}] enriched test cases: ${enrichedTC.length}`);
  }

  // 3. Grade baseline (per-case checkpointing)
  console.log(`\n[${ts()}] Step 3/4: grade baseline test cases (N=${baselineTC.length})...`);
  const baselineGrades: Grade[] = loadCheckpoint<Grade[]>('baseline-grades') ?? [];
  const baselineDoneIds = new Set(baselineGrades.map((g) => g.testCaseId));
  for (let i = 0; i < baselineTC.length; i++) {
    const tc = baselineTC[i];
    if (baselineDoneIds.has(tc.id)) {
      process.stdout.write(`  [${ts()}] [baseline] ${i + 1}/${baselineTC.length}: ${tc.id} (cached)\n`);
      continue;
    }
    process.stdout.write(`  [${ts()}] [baseline] ${i + 1}/${baselineTC.length}: ${tc.id}\n`);
    const g = await gradeTestCase(provider, designForJudge as never, tc);
    baselineGrades.push(g);
    saveCheckpoint('baseline-grades', baselineGrades);
  }
  const baselineSummary = summarize(baselineGrades);

  // 4. Grade enriched (per-case checkpointing)
  console.log(`\n[${ts()}] Step 4/4: grade enriched test cases (N=${enrichedTC.length})...`);
  const enrichedGrades: Grade[] = loadCheckpoint<Grade[]>('enriched-grades') ?? [];
  const enrichedDoneIds = new Set(enrichedGrades.map((g) => g.testCaseId));
  for (let i = 0; i < enrichedTC.length; i++) {
    const tc = enrichedTC[i];
    if (enrichedDoneIds.has(tc.id)) {
      process.stdout.write(`  [${ts()}] [enriched] ${i + 1}/${enrichedTC.length}: ${tc.id} (cached)\n`);
      continue;
    }
    process.stdout.write(`  [${ts()}] [enriched] ${i + 1}/${enrichedTC.length}: ${tc.id}\n`);
    const g = await gradeTestCase(provider, designForJudge as never, tc);
    enrichedGrades.push(g);
    saveCheckpoint('enriched-grades', enrichedGrades);
  }
  const enrichedSummary = summarize(enrichedGrades);

  const results: HarnessResults = {
    metadata: {
      timestamp: new Date().toISOString(),
      provider: provider.name,
      model,
      designId: design.id,
      designName: design.name,
      enricherVersion: enriched.metadata.enricherVersion,
      methodologyNote:
        'Test cases generated and graded by the same model family (claude-sonnet-4-6, temperature 0). Judge prompted in two orderings; conservative aggregate (worse of the two) used when runs disagree. Inter-prompt agreement reported as judgeAgreementPct. This is LLM-as-judge methodology; human-validated grading is in progress as future work and will be reported in the journal version.',
    },
    baseline: {
      testCases: baselineTC.map(testCaseSnapshot),
      grades: baselineGrades,
      summary: baselineSummary,
    },
    enriched: {
      derivedConstraints: enriched.derivedConstraints.length,
      reviewQuestions: enriched.reviewQuestions.length,
      testCases: enrichedTC.map(testCaseSnapshot),
      grades: enrichedGrades,
      summary: enrichedSummary,
    },
    delta: {
      acceptedAsIsPctDelta: enrichedSummary.acceptedAsIsPct - baselineSummary.acceptedAsIsPct,
      minorEditPctDelta: enrichedSummary.minorEditPct - baselineSummary.minorEditPct,
      majorReworkPctDelta: enrichedSummary.majorReworkPct - baselineSummary.majorReworkPct,
    },
  };

  // Persist full results
  const outPath = join(process.cwd(), 'results.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nresults written to ${outPath}\n`);

  // Print the headline table
  const fmt = (n: number) => `${n.toFixed(1)}%`;
  console.log('=== EVALUATION SUMMARY ===');
  console.log('                    baseline    enriched    delta');
  console.log(
    `accepted-as-is      ${fmt(baselineSummary.acceptedAsIsPct).padStart(8)}    ${fmt(enrichedSummary.acceptedAsIsPct).padStart(8)}    ${(results.delta.acceptedAsIsPctDelta >= 0 ? '+' : '') + results.delta.acceptedAsIsPctDelta.toFixed(1)}%`,
  );
  console.log(
    `minor-edit          ${fmt(baselineSummary.minorEditPct).padStart(8)}    ${fmt(enrichedSummary.minorEditPct).padStart(8)}    ${(results.delta.minorEditPctDelta >= 0 ? '+' : '') + results.delta.minorEditPctDelta.toFixed(1)}%`,
  );
  console.log(
    `major-rework        ${fmt(baselineSummary.majorReworkPct).padStart(8)}    ${fmt(enrichedSummary.majorReworkPct).padStart(8)}    ${(results.delta.majorReworkPctDelta >= 0 ? '+' : '') + results.delta.majorReworkPctDelta.toFixed(1)}%`,
  );
  console.log('');
  console.log(`baseline N=${baselineSummary.total}, enriched N=${enrichedSummary.total}`);
  console.log(`judge agreement: baseline=${fmt(baselineSummary.judgeAgreementPct)}, enriched=${fmt(enrichedSummary.judgeAgreementPct)}`);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
