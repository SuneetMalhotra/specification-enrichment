// providers/openai.ts — OpenAI provider for the cross-model replication
// described in §4.6 of the article.
//
// Stub implementation: the interface and command surface are wired up but
// the actual HTTP call requires the operator to supply OPENAI_API_KEY and a
// minimal HTTP client. The stub throws a clear error pointing at the missing
// configuration. The article's reproducibility statement (§6.1) documents
// the exact command surface this stub exposes.
//
// MIT License.

import { ModelProvider, GenerateOptions } from './types';

export interface OpenAIProviderOptions {
  /**
   * Model identifier. Recommended values: 'gpt-4.1', 'gpt-5'.
   */
  model?: string;
  /**
   * API key. Defaults to process.env.OPENAI_API_KEY.
   */
  apiKey?: string;
  /**
   * Subprocess timeout, milliseconds. Default 300_000.
   */
  timeoutMs?: number;
}

export class OpenAIProvider implements ModelProvider {
  name = 'openai';
  private readonly model: string;
  private readonly apiKey: string | undefined;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.model = opts.model ?? process.env.MODEL ?? 'gpt-4.1';
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. To enable the OpenAI provider for §4.6 cross-model replication, set the environment variable: export OPENAI_API_KEY=sk-... then re-run: npx tsx harness.ts --provider openai'
      );
    }
    // Production users replace this stub with a real HTTPS call.
    // The shape: POST https://api.openai.com/v1/chat/completions with
    // messages=[{role:'system', content:opts.system}, {role:'user', content:opts.user}].
    // Return the assistant message content.
    throw new Error(
      'OpenAIProvider.generate is a stub. Implement the chat/completions call to OpenAI and return the response text. See providers/anthropic.ts for the spawn-based pattern; the OpenAI version uses HTTPS fetch instead of a subprocess.'
    );
  }
}
