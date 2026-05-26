// providers/ollama.ts — local-weights Llama-family provider via Ollama.
//
// Hits the Ollama HTTP API (default http://localhost:11434/api/chat). No API
// key required: the operator runs `ollama serve` locally and `ollama pull
// <model>` once, then this provider routes generation through the local
// process. The same `ModelProvider` interface as anthropic.ts / openai.ts /
// gemini.ts / stub.ts, so harnesses are backend-agnostic.
//
// Open-weights testing pipelines (e.g. Rehan et al., Electronics 14(7) 1463,
// https://github.com/Shaheer-Rehan/Llama-2-for-Software-Testing) demonstrate
// that fine-tuned Llama-family models can produce competitive test artifacts
// on focal-method-to-test-case tasks; this provider lets the §4 enrichment
// stage run against any model Ollama can serve, including those weights.

import { ModelProvider, GenerateOptions } from './types';

export interface OllamaProviderOptions {
  /** Ollama HTTP endpoint. Defaults to env OLLAMA_HOST or http://localhost:11434. */
  baseUrl?: string;
  /** Model tag. Defaults to env OLLAMA_MODEL or 'llama3.2'. Examples:
   *  'llama3.2', 'llama3.1:70b', 'codellama:13b', 'mistral', 'qwen2.5-coder'. */
  model?: string;
  /** Subprocess equivalent timeout. Default 300_000 ms (5 min). */
  timeoutMs?: number;
}

export class OllamaProvider implements ModelProvider {
  name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: OllamaProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = opts.model ?? process.env.OLLAMA_MODEL ?? 'llama3.2';
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
          options: {
            temperature: opts.temperature ?? 0,
            num_predict: opts.maxTokens ?? -1,
          },
          // Force JSON-shaped output when the caller asks for it; Ollama
          // honors the `format: 'json'` flag for supported models.
          ...(opts.responseFormat === 'json' ? { format: 'json' } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Ollama HTTP ${res.status} at ${this.baseUrl}/api/chat: ${body.slice(0, 500)}\n` +
            `Hint: ensure 'ollama serve' is running and 'ollama pull ${this.model}' has completed.`,
        );
      }
      const data = (await res.json()) as { message?: { content?: string } };
      const text = (data.message?.content ?? '').trim();
      if (!text) {
        throw new Error(`Ollama returned an empty message; verify model '${this.model}' is loaded.`);
      }
      return text;
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') {
        throw new Error(`Ollama timed out after ${this.timeoutMs}ms (model=${this.model}).`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
