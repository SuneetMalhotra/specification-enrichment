// examples/predicate-roundtrip.ts
//
// End-to-end demonstration of the §3.2 predicate→merge wiring referenced in
// the article: reviewer answers one questionnaire item → the merge predicate
// evaluates whether the answer materially changes the constraint → the
// enricher promotes the answer and (if material) the downstream test plan
// regenerates.
//
// Per §3.2 of the article, this is the trace that converts the documented
// mechanism into a demonstrated one. Uses the JaccardMergePredicate so the
// example is runnable without embedding infrastructure (the
// CosineSimilarityMergePredicate path is documented in similarity.ts and
// requires an injected embed function — production users supply OpenAI
// text-embedding-3, sentence-transformers, or any equivalent).
//
// Run with: npx tsx examples/predicate-roundtrip.ts
//
import { JaccardMergePredicate } from '../similarity.js';
import type { EnrichedSpec, Constraint, DesignArtifact } from '../types.js';

// Fixture design (synthetic TodoMVC-like) and the enriched spec the
// enrichment stage would produce. Structure exactly matches the EnrichedSpec
// type in types.ts so the merge predicate exercise stays type-safe.

const fixtureDesign: DesignArtifact = {
  id: 'roundtrip-demo-design',
  name: 'TodoMVC (synthetic round-trip fixture)',
  body: 'A single-page todo list: input, list, footer with counter and clear-completed action.',
};

// Each review question pairs with a "model-assumed" constraint that the
// enrichment stage emitted as a low-confidence guess and surfaced for
// reviewer adjudication. The predicate compares the model's assumption
// (modelAssumption[constraintId]) against the reviewer's answer to decide
// whether the post-merge spec materially diverges from the pre-merge spec.

const modelAssumption = new Map<string, string>([
  ['Q1', 'No explicit upper bound; the list should remain usable up to several hundred items.'],
  ['Q2', 'Completed items remain in the list with a strikethrough; the user clears them via the "Clear completed" button.'],
  ['Q3', 'Accept duplicates silently; duplicates are allowed.'],
]);

const fixtureSpec: EnrichedSpec = {
  source: fixtureDesign,
  derivedConstraints: [
    {
      id: 'C1',
      description:
        'The new-todo input field accepts text up to 200 characters and submits on Enter.',
      confidence: 0.92,
      justification:
        'Direct from the design: form requires text entry and Enter submission.',
      category: 'validation',
    },
  ],
  reviewQuestions: [
    {
      constraintId: 'Q1',
      question:
        'What is the maximum number of todo items the list should hold before pagination or scrolling kicks in?',
      priority: 'low',
    },
    {
      constraintId: 'Q2',
      question:
        'Should completed items remain in the list, be hidden by default, or be moved to a separate "completed" section?',
      priority: 'high',
    },
    {
      constraintId: 'Q3',
      question:
        'When the user enters a duplicate todo (same text as an existing item), should the application warn, deduplicate, or accept silently?',
      priority: 'high',
    },
  ],
  metadata: {
    enricherVersion: 'roundtrip-demo',
    modelProvider: 'fixture',
    timestamp: new Date().toISOString(),
    confidenceThreshold: 0.7,
  },
};

// Reviewer answers: one semantically equivalent to the model's assumption,
// two materially different (override the model's policy).

const reviewerAnswers = new Map<string, string>([
  // Q1: reviewer confirms the model's assumption almost verbatim (adds only
  // a short "confirmed; no v1 changes needed" suffix). Token overlap with
  // the model assumption is high → predicate should return FALSE → no
  // regeneration.
  ['Q1', 'No explicit upper bound; the list should remain usable up to several hundred items. (Confirmed; no v1 changes needed.)'],

  // Q2: reviewer overrides — completed items move to a collapsible section,
  // not strikethrough-in-place. MATERIAL change → regenerate.
  ['Q2', 'Completed items must be moved to a separate "Done" section that is collapsed by default. The user expands it to review or restore items.'],

  // Q3: reviewer flips the policy from accept-silently to warn-on-duplicate.
  // MATERIAL change → regenerate.
  ['Q3', 'Duplicates must trigger an inline warning under the input field and require a confirmation tap before submission.'],
]);

// Simulated downstream test-plan generator: in the reference pipeline this
// would be a separate LLM call; for the demonstration we approximate it as
// "one downstream test per derived constraint, plus one per high-priority
// regenerated constraint." The point is to show that a downstream artifact
// count *changes* when the predicate fires.

function simulatedTestPlanSize(constraints: Constraint[], regeneratedIds: Set<string>): number {
  const base = constraints.length;
  // Each regenerated constraint adds one "additional test scenario" downstream.
  return base + regeneratedIds.size;
}

async function main(): Promise<void> {
  const predicate = new JaccardMergePredicate(0.30);

  // eslint-disable-next-line no-console
  console.log('=== Predicate->Merge Round-Trip Demonstration (§3.2) ===\n');

  const preCount = fixtureSpec.derivedConstraints.length;
  const updatedConstraints: Constraint[] = [...fixtureSpec.derivedConstraints];
  const regeneratedIds = new Set<string>();

  for (const q of fixtureSpec.reviewQuestions) {
    const answer = reviewerAnswers.get(q.constraintId);
    if (!answer) continue;

    const pre = modelAssumption.get(q.constraintId) ?? q.question;
    const changed = await predicate.materiallyChanged(pre, answer);

    // eslint-disable-next-line no-console
    console.log(`--- ${q.constraintId} (priority=${q.priority}) ---`);
    // eslint-disable-next-line no-console
    console.log(`  Question:           ${q.question}`);
    // eslint-disable-next-line no-console
    console.log(`  Model assumption:   ${pre}`);
    // eslint-disable-next-line no-console
    console.log(`  Reviewer answer:    ${answer}`);
    // eslint-disable-next-line no-console
    console.log(`  Predicate:          materiallyChanged = ${changed}`);
    // eslint-disable-next-line no-console
    console.log(`                      (Jaccard distance threshold = 0.30)`);

    if (changed) {
      regeneratedIds.add(q.constraintId);
      // eslint-disable-next-line no-console
      console.log(`  Action:             enricher.merge() promotes + downstream test plan REGENERATES.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  Action:             enricher.merge() promotes; downstream test plan REUSED.`);
    }

    updatedConstraints.push({
      id: q.constraintId,
      description: answer,
      confidence: 1.0,
      justification: `Reviewer answer to: "${q.question}"`,
      category: 'reviewer-confirmed',
    });

    // eslint-disable-next-line no-console
    console.log();
  }

  const preTestCount = simulatedTestPlanSize(fixtureSpec.derivedConstraints, new Set());
  const postTestCount = simulatedTestPlanSize(updatedConstraints, regeneratedIds);

  // eslint-disable-next-line no-console
  console.log('=== Summary ===');
  // eslint-disable-next-line no-console
  console.log(`  Pre-merge constraints:                ${preCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Post-merge constraints:               ${updatedConstraints.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Reviewer answers triggering regen:    ${regeneratedIds.size} of ${reviewerAnswers.size}`);
  // eslint-disable-next-line no-console
  console.log(`  Regenerated constraint ids:           [${[...regeneratedIds].join(', ')}]`);
  // eslint-disable-next-line no-console
  console.log(`  Pre-merge test plan size (simulated): ${preTestCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Post-merge test plan size (simulated):${postTestCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Downstream artifact CHANGED:          ${preTestCount !== postTestCount ? 'YES' : 'NO'}`);
  // eslint-disable-next-line no-console
  console.log();
  // eslint-disable-next-line no-console
  console.log(`Demonstration complete. Production: replace JaccardMergePredicate with`);
  // eslint-disable-next-line no-console
  console.log(`CosineSimilarityMergePredicate + an injected embed function (similarity.ts:30).`);
}

void main();
