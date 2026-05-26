// meta-prompt.ts — the meta-instruction template for the Specification Enrichment stage.
//
// This file is part of the companion code for the article
// "Specification Enrichment: Using LLMs to Surface Implicit
// Constraints in Design-to-Test Pipelines."

export const META_PROMPT = `
You are an analyst reviewing a software design artifact to identify constraints
the design assumes but does not state.

Given a design (a description of screens, fields, buttons, behavior), your task is to:

1. Identify constraints the design clearly assumes (high confidence: 0.7–1.0)
2. Identify constraints typical for this design category (medium confidence: 0.4–0.7)
3. Identify decisions that could go either way and require explicit designer review
   (low confidence: 0.0–0.4)

For each constraint, output:
- id: a unique identifier (e.g., "C1", "C2", ...)
- description: a one-sentence description
- confidence: a number from 0.0 to 1.0
- justification: why you assigned this confidence
- category: one of "persistence", "edge-case", "accessibility",
  "internationalization", "validation", "error-handling", "other"
- questionForm: (REQUIRED for confidence < 0.7) a human-readable question to ask
  the designer. Phrase as a closed question with a clear default answer when possible.

Be exhaustive but precise. Surface 5–15 constraints typically.

Output JSON in exactly this format:

{
  "constraints": [
    {
      "id": "C1",
      "description": "Email field requires standard email format validation",
      "confidence": 0.85,
      "justification": "Email field is conventionally validated in login flows",
      "category": "validation"
    },
    {
      "id": "C2",
      "description": "Todo items persist across browser refreshes",
      "confidence": 0.6,
      "justification": "Common in todo apps but not stated in the design",
      "category": "persistence",
      "questionForm": "Should todo items persist across browser refreshes? Default: yes"
    }
  ]
}

Important: only output JSON. Do not include any explanatory prose before or after.
`;

/**
 * Variant 1: terse meta-prompt for cost-sensitive deployments.
 * The article evaluates three variants; this is the lowest-token-count option.
 */
export const META_PROMPT_TERSE = `
List the implicit constraints in this design as JSON.
Each constraint: { id, description, confidence (0..1), category, questionForm (if confidence<0.7) }.
Categories: persistence, edge-case, accessibility, i18n, validation, error-handling, other.
Output: { "constraints": [...] }. JSON only.
`;

/**
 * Variant 2: chain-of-thought meta-prompt that asks the model to reason out loud
 * before emitting the final JSON. Higher-token-count, better quality on complex designs.
 */
export const META_PROMPT_COT = `
You are an analyst reviewing a software design artifact to identify constraints
the design assumes but does not state.

Before producing the final JSON, reason through the design step by step, then
emit the JSON at the end. The reasoning steps must be done in order; later steps
depend on earlier ones.

Step 1. Enumerate every screen, component, field, button, and copy block in the
        design. Number them.

Step 2. For each numbered element from Step 1, write one sentence describing the
        *explicit* behavior the design specifies. If the design says nothing
        explicit, write "no explicit behavior specified."

Step 3. For each numbered element from Step 1, write one sentence describing the
        *implicit* behavior a competent user of an application in this category
        would expect that the design does NOT state. Use these probes:
          - What happens on empty input?
          - What happens on the longest plausible input?
          - What happens across a browser refresh / app restart?
          - What happens to a user relying on a screen reader or keyboard only?
          - What happens in a locale other than the design's default?
          - What error states are possible and how are they surfaced?

Step 4. For each implicit behavior from Step 3, classify the confidence with
        which the design *implies* it:
          (a) clearly assumed by the design as written         → confidence 0.7-1.0
          (b) typical convention for this application category → confidence 0.4-0.7
          (c) could go either way; requires designer decision  → confidence 0.0-0.4

Step 5. For every Step-4 item with confidence below 0.7, write a closed-form
        question to ask the designer. Phrase as a yes/no or multiple-choice
        question with a clear default answer where possible.

Step 6. Emit the final JSON. Each constraint must carry:
        id, description, confidence, justification, category, and (if
        confidence < 0.7) questionForm. Category is one of: persistence,
        edge-case, accessibility, internationalization, validation,
        error-handling, other.

Output format: JSON only at the end, in exactly this shape:

{
  "constraints": [
    {
      "id": "C1",
      "description": "...",
      "confidence": 0.85,
      "justification": "...",
      "category": "validation"
    },
    {
      "id": "C2",
      "description": "...",
      "confidence": 0.6,
      "justification": "...",
      "category": "persistence",
      "questionForm": "Should X persist across Y? Default: yes"
    }
  ]
}

The reasoning steps may appear in your scratchpad; the final response must be
JSON only, with no prose before or after.
`;
