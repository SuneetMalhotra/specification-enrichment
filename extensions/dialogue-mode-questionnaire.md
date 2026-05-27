<!--
SOURCE INSPIRATION: ChatDev (https://github.com/OpenBMB/ChatDev).
Specifically: the chat-chain protocol in CompanyConfig/Default/
ChatChainConfig.json (chatdev1.0 branch) and the per-phase prompts in
PhaseConfig.json, where each phase runs as a two-or-three-turn
dialogue between an assistant_role and a user_role with optional
reflection.

This document is a DESIGN NOTE only. The existing enricher.ts merge()
method is a one-shot apply: the reviewer answers all questions in one
pass, the merge happens once. This note describes how that channel
could become a multi-turn dialogue.
-->

# Extension proposal — dialogue-mode reviewer questionnaire

Status: design note, **not implemented**. `enricher.ts` is unchanged.

## What `enricher.ts` does today

`SpecificationEnricher.merge(enriched, answers)` is a pure function:
- Input: the `EnrichedSpec` from `enrich()` plus a `Map<constraintId, answer>`.
- Output: a new `EnrichedSpec` with each answered question promoted to
  a constraint of `category: 'reviewer-confirmed', confidence: 1.0`.
- The merge fires once. There is no turn-taking with the reviewer.

This is right for the published evaluation — the manuscript treats
the reviewer as a one-shot oracle so that the precision/recall numbers
are not confounded by reviewer fatigue or by clarification-induced
drift. It is wrong for a production deployment, where:
1. A reviewer's answer to question 7 sometimes resolves question 11.
2. A reviewer's answer to question 4 sometimes raises a new
   constraint (a question of their own back at the system).
3. The reviewer may want to ask the system for justification before
   committing to an answer.

## What ChatDev does

ChatDev's chat-chain protocol structures every inter-role exchange
as a dialogue. The relevant feature for this design note is the
`need_reflect: true` flag on individual phases, which inserts a third
turn where the assistant_role re-reads its own answer and either
ratifies or revises it. The pattern generalises: an N-turn dialogue
with a stop condition.

## Proposed extension

Replace the one-shot `merge()` with a multi-turn `merge*()`
generator (or async iterator). On each turn:

1. **System emits a batch of questions.** Top K by priority and by
   diversity (avoid asking two questions that share a justification).
2. **Reviewer answers.** Free-form for free-form questions; constrained
   for closed questions ("yes" / "no" / "default").
3. **System runs the merge predicate.**
   - Promote answered questions to confirmed constraints.
   - Re-run a *partial* enrichment over the answered set: are any
     remaining questions now answerable from the new constraints?
     (Example: reviewer says "yes, items persist across refresh" →
     the question "do items persist across restart" can now be
     auto-answered yes-by-default.)
   - Surface any newly-implied constraints with `confidence ∈ [0.4,
     0.7]` as new questions in the next batch.
4. **Stop condition.** Loop until one of:
   - No questions remain.
   - The reviewer answers `skip` to a `low` priority question. (The
     `high` and `blocking` priorities must be answered to stop.)
   - A turn cap is hit (default 5).

## Proposed API shape

```ts
// extensions/dialogue-mode-questionnaire.ts  (would live alongside enricher.ts)
export interface DialogueTurn {
  questions: ReviewQuestion[];
  /** Reviewer fills this in before calling next() again. */
  answers?: Map<string, string>;
}

export async function* runDialogueQuestionnaire(
  enricher: SpecificationEnricher,
  initial: EnrichedSpec,
  options?: { maxTurns?: number; batchSize?: number },
): AsyncGenerator<DialogueTurn, EnrichedSpec> { /* ... */ }
```

The caller drives the loop:

```ts
const gen = runDialogueQuestionnaire(enricher, enriched);
for await (const turn of gen) {
  // present turn.questions to the reviewer
  turn.answers = await collectAnswers(turn.questions);
}
const final = gen.return().value; // final EnrichedSpec
```

## Merge predicate — what fires on each turn

Today, the merge predicate is:
```
if (answers.has(question.constraintId)) promote to constraint
else keep question
```

The dialogue-mode predicate adds three rules:
```
1. As above.
2. For every newly-confirmed constraint, re-run a constrained
   enrichment call over the remaining low-confidence constraints,
   passing the new confirmations as context. Any constraint whose
   confidence now crosses the threshold is promoted silently.
3. Any new constraint surfaced by step 2 with confidence in the
   review band is appended to the question queue.
```

The third rule is what makes this a dialogue and not a batched
one-shot: the system can ask follow-up questions in response to the
reviewer's answers.

## What does NOT change

- `enricher.ts` is untouched.
- `types.ts` is untouched — `ReviewQuestion` and `EnrichedSpec`
  carry over.
- The merge predicate's *correctness* property is preserved: a
  reviewer who answers all questions in the first batch identically
  to the one-shot `merge()` gets the same final `EnrichedSpec`.

## Why this is a design note and not an implementation

The dialogue mode requires a reviewer who is *available across turns*.
The published evaluation uses static answer files (e.g.
`results/answers_todomvc.json`) to keep the numbers reproducible. A
dialogue mode is only meaningful with an interactive reviewer in the
loop, which is incompatible with the reproducibility contract of the
reference implementation. The right time to land this code is when
the harness gains an interactive front-end (CLI prompt or web form)
for the reviewer.

## Reading list

- ChatDev chat-chain protocol: chatdev1.0 branch,
  `CompanyConfig/Default/PhaseConfig.json` and `ChatChainConfig.json`.
- ChatDev paper: Qian et al., "Communicative Agents for Software
  Development," arXiv:2307.07924. The "communicative dehallucination"
  section is the closest published analogue to the merge-predicate
  loop above.
- The Article 2 companion repo's `dialogue/communicative-handoff.ts`
  is the same shape applied to inter-agent handoffs instead of
  human-in-the-loop questionnaires; the two extensions are
  intentionally symmetric.
