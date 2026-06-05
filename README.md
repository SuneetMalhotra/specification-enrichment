# specification-enrichment

Reference implementation for the **Specification Enrichment** pipeline pattern.

Companion code for the forthcoming IEEE Software article:

> Malhotra, S. "Specification Enrichment: Testing What the Design Forgot to Say." IEEE Software (under submission), 2026.

---

## What this is

AI-augmented design-to-test pipelines (Figma → PRD → tickets → test cases → automation code) routinely hit a ~70% accuracy ceiling. The dominant cause is not the model; it is **structural underspecification of upstream design artifacts**. A Figma frame for a login screen does not state password rules. A PRD does not enumerate offline behavior. Downstream artifacts inherit these gaps and compound them.

**Specification Enrichment** introduces an intermediate stage:

```
Design → [Specification Enrichment] → Enriched Spec → PRD → Tickets → Tests → Automation
                ↓
        Review Questions
        (non-blocking, async)
```

The enrichment stage prompts the model to enumerate the implicit constraints the design assumes but does not state. High-confidence constraints flow into the downstream pipeline; low-confidence constraints become a structured questionnaire delivered to the design owner asynchronously. The pipeline does not block waiting for answers — it proceeds with the model's best guess and regenerates if the answers materially change the enrichment.

This repository contains the runnable reference implementation plus the empirical harness used in the article.

---

## What's inside

```
src/
├── types.ts                  # Public types: DesignArtifact, EnrichedSpec, Constraint, ReviewQuestion
├── enricher.ts               # The Specification Enrichment stage
├── meta-prompt.ts            # Three meta-prompt variants (default / terse / chain-of-thought)
├── pipeline.ts               # Baseline + enriched test-case generators
├── judge.ts                  # LLM-as-judge grader (with position-bias guard)
├── harness.ts                # Head-to-head empirical evaluation entry point
├── designs/
│   └── todomvc.ts            # The TodoMVC reference design used in the article
├── providers/
│   ├── types.ts              # ModelProvider interface
│   ├── stub.ts               # Deterministic stub for offline testing
│   └── anthropic.ts          # Real provider: shells to `claude -p` (OAuth, no API key)
└── examples/
    └── run-example.ts        # Minimal end-to-end demo using the stub provider
```

---

## Quickstart

```bash
npm install
npm run typecheck               # strict-mode TypeScript check (tsc --noEmit)
npm run example                 # offline demo with the stub provider
npm run harness:stub            # full harness run with stub (deterministic; same numbers every time)
npm run harness:anthropic       # full harness run using `claude -p` (requires Claude OAuth)
npx tsx harness.ts --provider ollama   # full harness run against local Ollama (no API key, open weights)
npx tsx harness.ts --provider openai   # requires OPENAI_API_KEY
npx tsx harness.ts --provider gemini   # requires GOOGLE_API_KEY
```

The `anthropic` runs require [Claude Code](https://docs.claude.com/en/docs/claude-code) installed at `~/.local/bin/claude` and an authenticated OAuth session. No API key is read or required.

### Running against open-weights models via Ollama

The `providers/ollama.ts` adapter routes generation through a local [Ollama](https://ollama.com) server, so the enrichment stage can be reproduced against open-weights Llama-family models (and any other Ollama-compatible model: Mistral, Qwen, CodeLlama). This is the open-weights complement to the hosted-model paths above and follows the open-weights LLM-testing pattern demonstrated in [Rehan et al. 2025](https://github.com/Shaheer-Rehan/Llama-2-for-Software-Testing).

```bash
# one-time setup
brew install ollama          # or download from https://ollama.com/download
ollama serve &               # start the local API on http://localhost:11434
ollama pull llama3.2         # ~2 GB; substitute any Ollama-served model

# run the harness against the local model
npx tsx harness.ts --provider ollama

# pick a different model or endpoint
OLLAMA_MODEL=codellama:13b npx tsx harness.ts --provider ollama
OLLAMA_HOST=http://remote-gpu:11434 OLLAMA_MODEL=llama3.1:70b \
  npx tsx harness.ts --provider ollama
```

Headline numbers in §4 of the article were produced against `claude-sonnet-4-6`; the Ollama path is reproducibility infrastructure for **cross-model replication** (§5.3 future work), not the source of the §4 numbers themselves.

Results are written to `results.json` at the end of every harness run.

---

## Reproducing the article's numbers

The article reports per-pipeline grading from the harness. To reproduce:

```bash
git clone https://github.com/SuneetMalhotra/specification-enrichment
cd specification-enrichment
npm install
npm run harness:anthropic > harness.log 2>&1
cat results.json | jq '{baseline: .baseline.summary, enriched: .enriched.summary, delta}'
```

The harness is deterministic at temperature 0, but model output is not byte-stable across model versions. The article pins the model version (`claude-sonnet-4-6`); subsequent runs against newer model versions may produce slightly different absolute numbers, though the qualitative direction of the delta has been stable across the model versions we tested.

`results.json` contains every generated test case, every grader verdict (both orderings), and the conservative aggregate. We publish the raw grades alongside the summary so reviewers can audit the LLM-judge.

---

## Methodology notes

- **Same-model evaluation.** Both pipelines are generated by the same model. The contribution is the *pipeline structure*, not the model. Cross-model robustness is future work and discussed in the article.
- **LLM-as-judge.** The 3-bucket grading is performed by the same model with the system prompt in `judge.ts`. We disclose this. Each test case is graded twice with the rubric options re-ordered; runs that disagree are aggregated conservatively (the *worse* of the two verdicts). Inter-prompt agreement is reported in `results.json` as `judgeAgreementPct`. A human-validated subset is in progress and will be reported in the journal version.
- **Temperature 0.** All generation and grading runs use deterministic decoding.
- **Threshold.** The default `confidenceThreshold` for promoting a constraint to the review questionnaire is `0.7`. Sensitivity to this threshold is discussed in §5 of the article.

---

## Citing this work

```bibtex
@article{Malhotra2026SpecEnrichment,
  author  = {Malhotra, Suneet},
  title   = {Specification Enrichment: Using {LLMs} to Surface Implicit
             Constraints in Design-to-Test Pipelines},
  journal = {IEEE Software},
  year    = {2026},
  note    = {Companion code: https://github.com/SuneetMalhotra/specification-enrichment}
}
```

---

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This work, the article, and this repository reflect the author's independent professional thinking and do not describe any specific employer's systems, products, code, or data. All examples are illustrative and constructed from public sources (TodoMVC, https://todomvc.com/).

## License

All rights reserved. © 2026 Suneet Malhotra. This repository is published for review and reproducibility of the companion article; no license is granted for redistribution or derivative works.
