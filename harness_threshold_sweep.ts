// harness_threshold_sweep.ts — confidence-threshold sensitivity analysis.
//
// The enrichment stage produces 15 constraints, each with a model-reported
// confidence. The default threshold is 0.7 — at or above the threshold, a
// constraint is silently incorporated into the downstream generation; below,
// it becomes a review question. This script re-buckets the SAME enrichment
// output at thresholds {0.5, 0.6, 0.7, 0.8, 0.9}, regenerates test cases for
// each, and reports category coverage. Avoids re-running the enrichment step
// (which is the same regardless of threshold) and avoids re-grading (the
// IEEE reviewer asked for category coverage, which is observable on the
// generated test cases without grading).
//

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicProvider } from './providers/anthropic';
import { generateEnriched, TestCase } from './pipeline';
import { TODOMVC_DESIGN } from './designs/todomvc';
import { EnrichedSpec, Constraint } from './types';

interface EnrichedCheckpoint {
  enriched: EnrichedSpec;
  testCases: TestCase[];
}

function readEnrichmentCheckpoint(): EnrichedSpec {
  // The harness.ts run writes .harness-checkpoint-enriched.json with the
  // enrichment + the 0.7-threshold enriched test cases. We reuse the
  // enrichment portion; the constraints list contains every constraint above
  // 0.7 already silently incorporated. To run the sweep, we need the FULL
  // constraint list (above-threshold + below-threshold = derivedConstraints +
  // reviewQuestions). The questions don't carry the constraint body though —
  // only the question text. So we read from the original enricher's raw
  // response cached in results.json.
  const resultsPath = join(process.cwd(), 'results', 'results_v2_lenient_judge_2026-05-24.json');
  const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  // The results.json doesn't carry the raw constraint list with confidences.
  // For the sweep, we re-run the enrichment step once to get the full list.
  // (Indirection: just call enricher.enrich() at threshold 0.0 to get every
  // constraint above 0.0 — which is all of them — in derivedConstraints.)
  throw new Error('helper not used; main re-enriches');
}

interface SweepRow {
  threshold: number;
  silentConstraints: number;
  reviewQuestions: number;
  testCases: number;
  categories: Record<string, number>;
  hasAccessibility: boolean;
  hasPersistence: boolean;
  edgeCaseCount: number;
}

async function main() {
  const provider = new AnthropicProvider({ model: 'claude-sonnet-4-6' });
  const startTime = Date.now();
  const ts = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

  console.log(`\n=== threshold-sensitivity sweep ===\n`);

  // 1. Run the enricher at threshold 0.0 — this captures EVERY constraint
  // the model produces (silently incorporated above 0.0, which is all of
  // them). We get the full list with confidence scores.
  console.log(`[${ts()}] running enrichment once (captures all 15 constraints)...`);
  const { SpecificationEnricher } = await import('./enricher');
  const enricher0 = new SpecificationEnricher({ provider, confidenceThreshold: 0.0 });
  const enrichedAll = await enricher0.enrich(TODOMVC_DESIGN);
  const allConstraints: Constraint[] = [
    ...enrichedAll.derivedConstraints,
    ...enrichedAll.reviewQuestions.map((q) => {
      const sourceConstraint = enrichedAll.derivedConstraints.find((c) => c.id === q.constraintId);
      // ReviewQuestions don't carry the full Constraint body in our types;
      // for the sweep we attribute the question to a synthetic constraint
      // entry. This only affects display; the silent-vs-question routing
      // happens by confidence score below.
      return sourceConstraint ?? {
        id: q.constraintId,
        description: q.question,
        confidence: 0.0,
        justification: 'reconstructed-from-question',
        category: 'other' as const,
      };
    }),
  ];
  console.log(`[${ts()}] captured ${allConstraints.length} constraints total`);

  // Confidences from the enricher come in groups (all above 0.0 went into
  // derivedConstraints). We need the original list. Workaround: re-run the
  // enrichment at the same threshold the article reports and infer from the
  // counts that 9 are at/above 0.7 and 6 are below. For the sweep table, we
  // need explicit confidence per constraint. The cleanest path is to call
  // the raw model and read the constraint JSON directly.
  console.log(`[${ts()}] calling model directly to capture raw constraint JSON with confidences...`);

  const { META_PROMPT } = await import('./meta-prompt');
  const designText = JSON.stringify(TODOMVC_DESIGN.body, null, 2);
  const rawResponse = await provider.generate({
    system: META_PROMPT,
    user: `Design: ${TODOMVC_DESIGN.name}\n\n${designText}`,
    responseFormat: 'json',
    temperature: 0,
  });

  // Parse the raw constraints with confidences
  const trimmed = rawResponse.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed) as { constraints: Constraint[] };
  const constraintsWithConf = parsed.constraints;
  console.log(`[${ts()}] captured ${constraintsWithConf.length} constraints with confidences`);
  console.log(`  confidence distribution:`, constraintsWithConf.map((c) => c.confidence.toFixed(2)).join(', '));

  // 2. For each threshold, build the enriched spec and regenerate test cases
  const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9];
  const rows: SweepRow[] = [];

  for (const threshold of thresholds) {
    console.log(`\n[${ts()}] === threshold ${threshold} ===`);
    const silentConstraints = constraintsWithConf.filter((c) => c.confidence >= threshold);
    const questionConstraints = constraintsWithConf.filter((c) => c.confidence < threshold);
    console.log(`  silent: ${silentConstraints.length}, questions: ${questionConstraints.length}`);

    const enrichedSpec: EnrichedSpec = {
      source: TODOMVC_DESIGN,
      derivedConstraints: silentConstraints,
      reviewQuestions: questionConstraints.map((c) => ({
        question: c.questionForm ?? c.description,
        constraintId: c.id,
        priority: c.confidence < 0.4 ? 'high' : 'low',
      })),
      metadata: {
        enricherVersion: '1.0.0',
        modelProvider: provider.name,
        timestamp: new Date().toISOString(),
        confidenceThreshold: threshold,
      },
    };

    console.log(`  [${ts()}] generating test cases...`);
    const testCases = await generateEnriched(provider, enrichedSpec);
    console.log(`  [${ts()}] ${testCases.length} test cases generated`);

    const cats: Record<string, number> = {};
    for (const tc of testCases) {
      const c = tc.category ?? 'other';
      cats[c] = (cats[c] || 0) + 1;
    }

    rows.push({
      threshold,
      silentConstraints: silentConstraints.length,
      reviewQuestions: questionConstraints.length,
      testCases: testCases.length,
      categories: cats,
      hasAccessibility: (cats.accessibility ?? 0) > 0,
      hasPersistence: (cats.persistence ?? 0) > 0,
      edgeCaseCount: cats['edge-case'] ?? 0,
    });
  }

  // 3. Write results
  const outPath = join(process.cwd(), 'results', 'results_threshold_sweep.json');
  writeFileSync(outPath, JSON.stringify({
    metadata: {
      timestamp: new Date().toISOString(),
      provider: provider.name,
      model: 'claude-sonnet-4-6',
      designId: TODOMVC_DESIGN.id,
      designName: TODOMVC_DESIGN.name,
      sweepNote: 'Single enrichment run; re-bucketed at each threshold; test-case generation regenerated per threshold; no grading (category coverage observable on the generated test cases).',
    },
    totalConstraints: constraintsWithConf.length,
    confidences: constraintsWithConf.map((c) => ({ id: c.id, confidence: c.confidence, category: c.category })),
    sweep: rows,
  }, null, 2));
  console.log(`\n[${ts()}] results written to ${outPath}`);

  // 4. Print summary table
  console.log('\n=== THRESHOLD SWEEP SUMMARY ===');
  console.log('thresh | silent | questions | tests | happy | edge | error | a11y | persist | other');
  console.log('-------+--------+-----------+-------+-------+------+-------+------+---------+------');
  for (const r of rows) {
    const c = r.categories;
    console.log(
      `  ${r.threshold.toFixed(1)}  |   ${String(r.silentConstraints).padStart(2)}   |     ${String(r.reviewQuestions).padStart(2)}    |  ${String(r.testCases).padStart(2)}   |   ${String(c['happy-path']??0).padStart(2)}  |  ${String(c['edge-case']??0).padStart(2)}  |   ${String(c['error-handling']??0).padStart(2)}  |  ${String(c.accessibility??0).padStart(2)}  |    ${String(c.persistence??0).padStart(2)}   |  ${String(c.other??0).padStart(2)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
