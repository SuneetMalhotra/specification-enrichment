// harness_multi_seed.ts — multi-seed variance characterization.
//
// Re-runs the enriched and enhanced-baseline configurations on TodoMVC
// across additional seeds to characterize per-category variance. The
// original §4.3 numbers in the article are seed 1; this harness adds
// seed 2 and seed 3. Final reporting is min/median/max per category.
//
// Temperature is 0 throughout; the variance source is the documented
// stable-but-not-strictly-deterministic behavior at temperature 0.
// The judge is NOT re-run on these additional seeds (this is a
// category-coverage variance characterization, not an acceptance-rate
// variance characterization); judge calls are the expensive part of
// the original harness and skipping them keeps this run tractable
// while still answering the IEEE reviewer's #2 critical change.
//
// Usage:
//   npx tsx harness_multi_seed.ts
//
// MIT License.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ModelProvider } from './providers/types';
import { AnthropicProvider } from './providers/anthropic';
import { TODOMVC_DESIGN } from './designs/todomvc';
import { SpecificationEnricher } from './enricher';
import { generateBaseline, generateEnriched, TestCase } from './pipeline';

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

interface RunResult {
  configuration: string;
  seed: number;
  testCases: TestCase[];
  categoryCounts: Record<string, number>;
}

async function generateOne(provider: ModelProvider, system: string): Promise<TestCase[]> {
  const design = TODOMVC_DESIGN;
  const designText =
    typeof design.body === 'string' ? design.body : JSON.stringify(design.body, null, 2);
  const response = await provider.generate({
    system,
    user: `Design: ${design.name}\n\n${designText}`,
    responseFormat: 'json',
    temperature: 0,
  });
  const trimmed = response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed);
  return parsed.testCases as TestCase[];
}

function countCategories(tc: TestCase[]): Record<string, number> {
  const cats: Record<string, number> = {
    'happy-path': 0, 'edge-case': 0, 'error-handling': 0,
    accessibility: 0, persistence: 0, internationalization: 0, other: 0,
  };
  for (const t of tc) {
    const c = (t.category ?? 'other') as string;
    cats[c] = (cats[c] || 0) + 1;
  }
  return cats;
}

async function main() {
  const provider = new AnthropicProvider({ model: 'claude-sonnet-4-6' });
  const startTime = Date.now();
  const ts = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
  console.log(`\n=== multi-seed variance harness (TodoMVC) ===\n`);

  const results: RunResult[] = [];
  const checkpointPath = join(process.cwd(), '.harness-checkpoint-multi-seed.json');
  if (existsSync(checkpointPath)) {
    results.push(...JSON.parse(readFileSync(checkpointPath, 'utf-8')));
    console.log(`[${ts()}] resumed from checkpoint (${results.length} runs cached)\n`);
  }

  const configs: Array<{ name: string; seed: number; runner: () => Promise<TestCase[]> }> = [];
  for (const seed of [2, 3]) {
    configs.push({
      name: 'Baseline-16',
      seed,
      runner: () => generateOne(provider, BASELINE_16_PROMPT),
    });
    configs.push({
      name: 'Baseline-16-Enhanced',
      seed,
      runner: () => generateOne(provider, BASELINE_16_ENHANCED_PROMPT),
    });
    configs.push({
      name: 'Enriched-16',
      seed,
      runner: async () => {
        const enricher = new SpecificationEnricher({ provider, threshold: 0.7 });
        const spec = await enricher.enrich(TODOMVC_DESIGN);
        return await generateEnriched(provider, spec);
      },
    });
  }

  for (const cfg of configs) {
    const key = `${cfg.name}@seed${cfg.seed}`;
    if (results.find((r) => r.configuration === cfg.name && r.seed === cfg.seed)) {
      console.log(`[${ts()}] ${key} (cached)`);
      continue;
    }
    console.log(`[${ts()}] running ${key}...`);
    const tc = await cfg.runner();
    const counts = countCategories(tc);
    results.push({ configuration: cfg.name, seed: cfg.seed, testCases: tc, categoryCounts: counts });
    writeFileSync(checkpointPath, JSON.stringify(results, null, 2));
    console.log(`  [${ts()}] ${key}: ${JSON.stringify(counts)}`);
  }

  // Aggregate.
  const byConfig: Record<string, Record<string, number[]>> = {};
  for (const r of results) {
    if (!byConfig[r.configuration]) byConfig[r.configuration] = {};
    for (const [cat, n] of Object.entries(r.categoryCounts)) {
      if (!byConfig[r.configuration][cat]) byConfig[r.configuration][cat] = [];
      byConfig[r.configuration][cat].push(n);
    }
  }

  const out = {
    metadata: {
      timestamp: new Date().toISOString(),
      provider: provider.name,
      model: 'claude-sonnet-4-6',
      designId: TODOMVC_DESIGN.id,
      seedsAdded: [2, 3],
      note: 'Seed 1 numbers are from the original harness runs (results.json, results_baseline16_count_matched.json, results_baseline16_enhanced.json). Seeds 2 and 3 here add two independent runs per configuration so per-category variance can be reported as min/median/max.',
    },
    runs: results,
    aggregatesAcrossSeeds23: byConfig,
  };
  const outPath = join(process.cwd(), 'results', 'results_multi_seed.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nresults written to ${outPath}\n`);

  console.log('=== PER-CONFIGURATION CATEGORY COUNTS (seeds 2 and 3 only) ===');
  for (const [cfg, cats] of Object.entries(byConfig)) {
    console.log(`\n${cfg}:`);
    for (const [cat, vals] of Object.entries(cats)) {
      console.log(`  ${cat.padEnd(20)} ${vals.join(', ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
