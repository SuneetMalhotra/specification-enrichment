// providers/gemini.ts — Google Gemini provider for the cross-model
// replication described in §4.6 of the article.
//
// Stub implementation. See providers/openai.ts for the rationale; this file
// is the symmetric Gemini variant.
//

import { ModelProvider, GenerateOptions } from './types';

export interface GeminiProviderOptions {
  /**
   * Model identifier. Recommended values: 'gemini-1.5-pro', 'gemini-2.0-pro'.
   */
  model?: string;
  /**
   * API key. Defaults to process.env.GOOGLE_API_KEY.
   */
  apiKey?: string;
}

export class GeminiProvider implements ModelProvider {
  name = 'gemini';
  private readonly model: string;
  private readonly apiKey: string | undefined;

  constructor(opts: GeminiProviderOptions = {}) {
    this.model = opts.model ?? process.env.MODEL ?? 'gemini-1.5-pro';
    this.apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'GOOGLE_API_KEY is not set. To enable the Gemini provider for §4.6 cross-model replication, set the environment variable: export GOOGLE_API_KEY=... then re-run: npx tsx harness.ts --provider gemini'
      );
    }
    throw new Error(
      'GeminiProvider.generate is a stub. Implement the generativelanguage.googleapis.com call and return the response text.'
    );
  }
}
