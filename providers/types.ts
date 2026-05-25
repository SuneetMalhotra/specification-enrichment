// providers/types.ts — the model provider interface.
// MIT License.

export interface GenerateOptions {
  system: string;
  user: string;
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
  temperature?: number;
}

export interface ModelProvider {
  name: string;
  generate(opts: GenerateOptions): Promise<string>;
}
