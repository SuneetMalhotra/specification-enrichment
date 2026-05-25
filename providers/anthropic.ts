// providers/anthropic.ts — provider that shells out to the Claude CLI (OAuth).
//
// Per the project convention (no ANTHROPIC_API_KEY), this provider invokes
// `claude -p` via a subprocess, which authenticates via the user's existing
// Claude OAuth session. No API key is read or required.
//
// MIT License.

import { spawn } from 'node:child_process';
import { ModelProvider, GenerateOptions } from './types';

export interface AnthropicProviderOptions {
  /**
   * Absolute path to the `claude` binary. Defaults to the path Claude Code
   * installs at: ~/.local/bin/claude
   */
  claudeBinaryPath?: string;
  /**
   * Model name passed via `--model`. Defaults to claude-sonnet-4-6.
   */
  model?: string;
  /**
   * Subprocess timeout, milliseconds. Default 300_000 (5 min). Test-case
   * generation can take 60–120s; enrichment with 11+ constraints can take
   * 90–180s. The default is conservative.
   */
  timeoutMs?: number;
}

const DEFAULT_BIN = `${process.env.HOME}/.local/bin/claude`;

export class AnthropicProvider implements ModelProvider {
  name = 'anthropic-oauth';
  private readonly bin: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.bin = opts.claudeBinaryPath ?? DEFAULT_BIN;
    this.model = opts.model ?? 'claude-sonnet-4-6';
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const combined = `${opts.system}\n\n---\n\n${opts.user}`;
    const args = ['-p', '--model', this.model];

    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`claude -p timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn ${this.bin}: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 500)}`));
          return;
        }
        resolve(stdout.trim());
      });

      child.stdin.write(combined);
      child.stdin.end();
    });
  }
}
