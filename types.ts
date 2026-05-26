// types.ts — public types for the Specification Enrichment reference implementation.
//
// This file is part of the companion code for the article
// "Specification Enrichment: Using LLMs to Surface Implicit
// Constraints in Design-to-Test Pipelines."

/**
 * A design artifact, as input to the pipeline. Intentionally minimal —
 * a real pipeline would have a richer schema (Figma JSON, Sketch, etc.).
 */
export interface DesignArtifact {
  id: string;
  name: string;
  // A textual description or structured JSON of the design's contents.
  // Real implementations would carry the full Figma payload here.
  body: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * A constraint surfaced by the Specification Enrichment stage.
 * Constraints with confidence above the threshold are silently
 * incorporated into the enriched spec; constraints below the threshold
 * become review questions.
 */
export interface Constraint {
  id: string;
  description: string;
  confidence: number;       // 0..1
  justification: string;
  category:
    | 'persistence'
    | 'edge-case'
    | 'accessibility'
    | 'internationalization'
    | 'validation'
    | 'error-handling'
    | 'reviewer-confirmed'
    | 'other';
  /**
   * Human-readable question form, used when the constraint is promoted
   * to the review questionnaire. Optional — set only for low-confidence
   * constraints.
   */
  questionForm?: string;
}

/**
 * A review question delivered to the design owner asynchronously.
 */
export interface ReviewQuestion {
  question: string;
  constraintId: string;
  priority: 'blocking' | 'high' | 'low';
}

/**
 * The enriched specification produced by the enrichment stage.
 */
export interface EnrichedSpec {
  source: DesignArtifact;
  derivedConstraints: Constraint[];
  reviewQuestions: ReviewQuestion[];
  metadata: {
    enricherVersion: string;
    modelProvider: string;
    timestamp: string;
    confidenceThreshold: number;
  };
}
