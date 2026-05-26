// examples/run-example.ts — end-to-end demo using the stub provider.

import { SpecificationEnricher } from '../enricher';
import { StubProvider } from '../providers/stub';
import { DesignArtifact } from '../types';

async function main() {
  // The TodoMVC design artifact, simplified for the demo.
  const todomvcDesign: DesignArtifact = {
    id: 'todomvc-1',
    name: 'TodoMVC',
    body: {
      screens: [
        {
          name: 'Main',
          components: [
            { type: 'input', placeholder: 'What needs to be done?' },
            { type: 'list', items: 'todo-item' },
            { type: 'filters', options: ['All', 'Active', 'Completed'] },
            { type: 'button', label: 'Clear completed' },
          ],
        },
      ],
      reference: 'https://todomvc.com/',
    },
  };

  // Use the stub provider for a deterministic demo (no API key needed).
  const enricher = new SpecificationEnricher({
    provider: new StubProvider(),
    confidenceThreshold: 0.7,
  });

  console.log('Enriching design:', todomvcDesign.name);
  const enriched = await enricher.enrich(todomvcDesign);

  console.log('\n=== Derived constraints (high confidence) ===');
  for (const c of enriched.derivedConstraints) {
    console.log(`[${c.id}] ${c.description} (confidence: ${c.confidence.toFixed(2)})`);
  }

  console.log('\n=== Review questions (delivered async to design owner) ===');
  for (const q of enriched.reviewQuestions) {
    console.log(`[${q.constraintId}] (${q.priority}) ${q.question}`);
  }

  console.log('\n=== Pipeline can proceed with the enriched spec ===');
  console.log('Total constraints:', enriched.derivedConstraints.length);
  console.log('Pending questions:', enriched.reviewQuestions.length);

  // Simulate the design owner answering some questions
  const answers = new Map<string, string>([
    ['C1', 'Yes, persist via localStorage'],
    ['C2', 'Silent reject — no error message'],
    ['C8', 'Target WCAG 2.1 AA'],
  ]);

  console.log('\n=== After design owner answers 3 of the questions ===');
  const merged = await enricher.merge(enriched, answers);
  console.log('Total constraints:', merged.derivedConstraints.length);
  console.log('Remaining questions:', merged.reviewQuestions.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
