// enricher.ts — the Specification Enrichment stage.
//
// This file is part of the companion code for the article
// "Specification Enrichment: Using LLMs to Surface Implicit
// Constraints in Design-to-Test Pipelines."
// MIT License.

import { ModelProvider } from './providers/types';
import { META_PROMPT } from './meta-prompt';
import {
  DesignArtifact,
  EnrichedSpec,
  Constraint,
  ReviewQuestion,
} from './types';

export interface EnricherOptions {
  provider: ModelProvider;
  /**
   * Constraints with confidence below this threshold are promoted to the review
   * questionnaire. Default 0.7. Lower values produce more questions and accept
   * fewer silent assumptions; higher values produce fewer questions and accept
   * more model judgment.
   */
  confidenceThreshold?: number;
  /**
   * Override the default meta-prompt. Useful for tuning to a specific application
   * category.
   */
  metaPrompt?: string;
  /**
   * Version string to embed in the metadata. Default '1.0.0'.
   */
  enricherVersion?: string;
}

export class SpecificationEnricher {
  private readonly threshold: number;
  private readonly prompt: string;
  private readonly version: string;

  constructor(private opts: EnricherOptions) {
    this.threshold = opts.confidenceThreshold ?? 0.7;
    this.prompt = opts.metaPrompt ?? META_PROMPT;
    this.version = opts.enricherVersion ?? '1.0.0';
  }

  /**
   * Enrich a design artifact. Returns the enriched specification with derived
   * constraints (high-confidence) and review questions (low-confidence).
   */
  async enrich(design: DesignArtifact): Promise<EnrichedSpec> {
    const response = await this.opts.provider.generate({
      system: this.prompt,
      user: this.formatDesign(design),
      responseFormat: 'json',
    });

    const parsed = this.parseResponse(response);

    const derivedConstraints: Constraint[] = [];
    const reviewQuestions: ReviewQuestion[] = [];

    for (const c of parsed.constraints) {
      const constraint: Constraint = {
        id: c.id,
        description: c.description,
        confidence: c.confidence,
        justification: c.justification,
        category: c.category,
        questionForm: c.questionForm,
      };

      if (c.confidence >= this.threshold) {
        derivedConstraints.push(constraint);
      } else {
        reviewQuestions.push({
          question:
            c.questionForm ??
            `Please confirm or revise: "${c.description}" (confidence: ${c.confidence.toFixed(2)})`,
          constraintId: c.id,
          priority: c.confidence < 0.4 ? 'high' : 'low',
        });
      }
    }

    return {
      source: design,
      derivedConstraints,
      reviewQuestions,
      metadata: {
        enricherVersion: this.version,
        modelProvider: this.opts.provider.name,
        timestamp: new Date().toISOString(),
        confidenceThreshold: this.threshold,
      },
    };
  }

  /**
   * Merge reviewer answers back into the enriched specification. Returns a new
   * EnrichedSpec with the answered questions promoted to confirmed constraints.
   */
  async merge(
    enriched: EnrichedSpec,
    answers: Map<string, string>,
  ): Promise<EnrichedSpec> {
    const updatedConstraints = [...enriched.derivedConstraints];
    const remainingQuestions: ReviewQuestion[] = [];

    for (const q of enriched.reviewQuestions) {
      const answer = answers.get(q.constraintId);
      if (answer) {
        updatedConstraints.push({
          id: q.constraintId,
          description: answer,
          confidence: 1.0,
          justification: `Confirmed by reviewer in response to: "${q.question}"`,
          category: 'reviewer-confirmed',
        });
      } else {
        remainingQuestions.push(q);
      }
    }

    return {
      ...enriched,
      derivedConstraints: updatedConstraints,
      reviewQuestions: remainingQuestions,
    };
  }

  private formatDesign(design: DesignArtifact): string {
    if (typeof design.body === 'string') {
      return `Design: ${design.name}\n\n${design.body}`;
    }
    return `Design: ${design.name}\n\n${JSON.stringify(design.body, null, 2)}`;
  }

  private parseResponse(response: string): { constraints: Constraint[] } {
    try {
      const trimmed = response.trim();
      // Strip code fences if present
      const cleaned = trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error(
        `Failed to parse enrichment response as JSON: ${e}. ` +
          `Response (first 200 chars): ${response.slice(0, 200)}`,
      );
    }
  }
}
