<!--
SOURCE INSPIRATION: Shaheer-Rehan/Llama-2-for-Software-Testing
(https://github.com/Shaheer-Rehan/Llama-2-for-Software-Testing).
Specifically: the finetuning_llama_2.ipynb and
Validation_of_Finetuned_Llama.ipynb notebooks, the QLoRA recipe,
and the choice of Microsoft methods2test (FM_FC context level,
25 K-record subset, 12 epochs) as the training corpus.

This document is a RECIPE OUTLINE, not executable training code. It
describes how the Rehan et al. recipe could be adapted to fine-tune
a local model on (design, enriched-spec) pairs produced by this
repo's enricher.ts. No training is performed; the recipe shows the
shape of the dataset, the prompt template, and the evaluation harness
that would be needed.
-->

# Recipe — fine-tune a local model on enriched-spec pairs

Status: recipe outline. **Not executable.** No training scripts,
checkpoints, or datasets are shipped in this repo.

## Rationale

The reference implementation in `enricher.ts` is provider-agnostic
and prompt-driven: it sends the meta-prompt in `meta-prompt.ts` to
whatever `ModelProvider` is passed in. For the manuscript's TodoMVC
and visitor-kiosk experiments this is the right shape — it lets the
reader reproduce the numbers with any of the five providers under
`providers/`.

For a production deployment with high enrichment volume the
prompt-driven shape has two costs:
1. Every enrichment call pays full prompt + meta-prompt tokens
   (~2.3 K tokens of system prompt before any design is added).
2. The category coverage of the model is bounded by what the
   pre-trained model knows about UI conventions; categories the
   model has seen rarely (e.g. medical-device kiosks, industrial
   HMIs) yield low-confidence constraints across the board.

A small fine-tuned model trained on (design, enriched-spec) pairs
addresses both. Rehan et al. demonstrated the recipe on
focal-method → unit-test pairs; this document is the analogue on
design → enriched-spec pairs.

## Adapted recipe (mirrors Rehan et al.'s finetuning_llama_2.ipynb)

### Base model
- **Default**: Llama-2-7b-chat-hf (NousResearch mirror), same as
  Rehan et al. for direct comparability.
- **Alternative**: Llama-3-8B-Instruct or a 13B variant if hardware
  permits.

### Dataset format
One JSONL row per training example:

```json
{
  "design_artifact": "<DesignArtifact serialised as the enricher.ts
                       formatDesign() does today>",
  "enriched_spec": {
    "derivedConstraints": [
      { "id": "C1", "description": "...", "confidence": 0.85,
        "justification": "...", "category": "validation" }
    ],
    "reviewQuestions": [
      { "question": "Should X persist across Y? Default: yes",
        "constraintId": "C2", "priority": "high" }
    ]
  }
}
```

The `enriched_spec` value is exactly the JSON the prompt-driven
enricher emits today, so generating the corpus is mechanical:
- Run `enricher.ts` against every available DesignArtifact (TodoMVC,
  visitor-kiosk, and any internal designs).
- Run a high-quality model (Claude Opus, GPT-4) as the labeller.
- Have a human reviewer fix obvious errors and the low-confidence
  constraint judgments (the rows where the reviewer questionnaire
  would have fired).
- Filter for token count (Rehan et al. did this on focal methods;
  the analogue here is "design + emitted JSON ≤ 4 096 tokens").

The training surface this repo can currently produce:
- 2 public designs (TodoMVC, visitor-kiosk) × ~12 constraints each
  = ~24 training rows from the manuscript material alone. This is
  far below the 25 K rows Rehan et al. used; the corpus must be
  expanded with internal designs before fine-tuning is viable.

### Prompt template (chat format)

```
<s>[INST] <<SYS>>
You are an analyst reviewing a software design artifact to identify
constraints the design assumes but does not state. Output JSON only,
in the schema { constraints: [{ id, description, confidence,
justification, category, questionForm? }] }.
<</SYS>>

Design: {design.name}

{design.body}
[/INST]
{enriched_spec_json}
</s>
```

Note: this is the META_PROMPT_TERSE variant from `meta-prompt.ts`,
not the full META_PROMPT. The full meta-prompt is overspecified for
training data because the model is being trained to *produce* the
schema, so the schema description in the system prompt would be
redundant.

### Training hyperparameters (mirrors Rehan et al. where reasonable)
- Quantisation: QLoRA (4-bit base, LoRA adapters at rank 16).
- Sequence length: 4096.
- Epochs: 3 to start (Rehan et al. used 12 on a much larger corpus;
  a smaller corpus needs fewer epochs to avoid memorisation).
- Learning rate: 2e-4 with cosine schedule, 50 warmup steps.
- Batch size: 4 with gradient accumulation 4 → effective 16.
- Hardware: A100 40 GB minimum (same as Rehan et al.).

### Evaluation harness (mirrors Rehan et al.'s
`Validation_of_Finetuned_Llama.ipynb`)

The evaluation surface this repo already has:
- The grading checkpoints under `.harness-checkpoint-*-grades.json`
  — these are LLM-judge grades produced by `judge.ts`.
- The threshold-sweep harness in `harness_threshold_sweep.ts`.

The fine-tuned model would be evaluated by:
1. Holding out 20 % of the training corpus.
2. Running the fine-tuned model against the held-out designs.
3. Running the prompt-driven baseline (Claude / GPT-4) against the
   same held-out designs.
4. Grading both with `judge.ts`.
5. Reporting (precision, recall, F1) on the derived constraints,
   broken out by category.

Rehan et al. compared generated unit tests to baseline tests; the
analogue here is comparing generated enriched-spec JSONs to a held-
out gold set.

## What is NOT in this recipe

- No training script. The Rehan et al. notebooks would need to be
  adapted; the adaptation is mechanical (swap the dataset loader and
  the prompt template) but is left out of this repo to keep the
  artifact reproducible without GPUs.
- No checkpoint. None is published.
- No claim that this recipe improves on the prompt-driven baseline
  in the manuscript. The manuscript's numbers are zero-shot. The
  recipe here is for a follow-up deployment, not for the article.

## Reading list

- Rehan et al., "Harnessing Large Language Models for Automated
  Software Testing: A Leap Towards Scalable Test Case Generation,"
  *Electronics* 14(7):1463, 2025.
- Microsoft methods2test corpus: https://github.com/microsoft/methods2test
- The two notebooks in https://github.com/Shaheer-Rehan/Llama-2-for-Software-Testing
  named `finetuning_llama_2.ipynb` and `Validation_of_Finetuned_Llama.ipynb`.
