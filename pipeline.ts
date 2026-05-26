// pipeline.ts — baseline and enriched test-case generators.
//
// Baseline:  DesignArtifact -> [LLM gen] -> TestCase[]
// Enriched:  DesignArtifact -> [Enrichment] -> EnrichedSpec -> [LLM gen] -> TestCase[]
//

import { ModelProvider } from './providers/types';
import { SpecificationEnricher } from './enricher';
import { DesignArtifact, EnrichedSpec } from './types';

export interface TestCase {
  id: string;
  title: string;
  preconditions: string[];
  steps: string[];
  expected: string;
  category?: string;
}

const BASELINE_PROMPT = `
You are a senior QA engineer. Given a design artifact, generate exactly 12
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

Use ids B1, B2, ..., B12. Output exactly 12 test cases. No prose. No code fences. Output the JSON only.
`.trim();

const ENRICHED_PROMPT = `
You are a senior QA engineer. Given a design artifact PLUS a set of confirmed
constraints (derived from category convention or confirmed by the design owner
via a review questionnaire), generate exactly 16 black-box test cases that
cover the user-facing surface. Use the confirmed constraints to expand
coverage of edge cases, persistence, accessibility, validation, and error
handling that the original design did not explicitly state. Each test case
should have an unambiguous, observable expected outcome.

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

function parseTestCases(raw: string): TestCase[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed);
  if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
    throw new Error('Response missing "testCases" array');
  }
  return parsed.testCases;
}

export async function generateBaseline(
  provider: ModelProvider,
  design: DesignArtifact,
): Promise<TestCase[]> {
  const designText =
    typeof design.body === 'string'
      ? design.body
      : JSON.stringify(design.body, null, 2);

  const user = `Design: ${design.name}\n\n${designText}`;

  const response = await provider.generate({
    system: BASELINE_PROMPT,
    user,
    responseFormat: 'json',
    temperature: 0,
  });

  return parseTestCases(response);
}

export async function generateEnriched(
  provider: ModelProvider,
  enriched: EnrichedSpec,
): Promise<TestCase[]> {
  const designText =
    typeof enriched.source.body === 'string'
      ? enriched.source.body
      : JSON.stringify(enriched.source.body, null, 2);

  const constraintsText = enriched.derivedConstraints
    .map(
      (c) =>
        `[${c.id}] (${c.category}, confidence ${c.confidence.toFixed(2)}) ${c.description}`,
    )
    .join('\n');

  const user = `Design: ${enriched.source.name}\n\n${designText}\n\nConfirmed constraints (from enrichment + reviewer answers):\n${constraintsText}`;

  const response = await provider.generate({
    system: ENRICHED_PROMPT,
    user,
    responseFormat: 'json',
    temperature: 0,
  });

  return parseTestCases(response);
}

/**
 * Run the full enriched pipeline: enrich the design, accept all derived
 * constraints (no reviewer round-trip), generate test cases. This is the
 * deterministic head-to-head against generateBaseline().
 */
export async function runEnrichedPipeline(
  provider: ModelProvider,
  design: DesignArtifact,
  confidenceThreshold = 0.7,
): Promise<{ enriched: EnrichedSpec; testCases: TestCase[] }> {
  const enricher = new SpecificationEnricher({ provider, confidenceThreshold });
  const enriched = await enricher.enrich(design);
  const testCases = await generateEnriched(provider, enriched);
  return { enriched, testCases };
}
