// similarity.ts — cosine similarity over sentence embeddings for the
// "materially changed" merge predicate (§3.3 of the article).
//
// The default implementation throws a clear error pointing the operator at
// the configuration step; production users supply an embedding function
// (OpenAI text-embedding-3, sentence-transformers, or any model that maps
// strings to fixed-dimension vectors). The interface is small and
// provider-agnostic to match the rest of the codebase.
//
// MIT License.

export type EmbeddingFn = (text: string) => Promise<number[]>;

export interface CosineSimilarityOptions {
  embed: EmbeddingFn;
  /**
   * Cosine similarity threshold at or above which the post-merge description
   * is treated as semantically equivalent to the pre-merge description (i.e.,
   * NO regeneration). Default 0.85.
   */
  tau?: number;
}

/**
 * Default predicate: returns `true` if the constraint changed enough to
 * require regeneration, `false` if pre and post are semantically close.
 *
 * Symmetric, defined on string inputs. Returns true when either input is
 * empty (treats absence as a material change).
 */
export class CosineSimilarityMergePredicate {
  private readonly embed: EmbeddingFn;
  private readonly tau: number;

  constructor(opts: CosineSimilarityOptions) {
    this.embed = opts.embed;
    this.tau = opts.tau ?? 0.85;
  }

  async materiallyChanged(pre: string, post: string): Promise<boolean> {
    if (!pre || !post) return true;
    const [a, b] = await Promise.all([this.embed(pre), this.embed(post)]);
    const sim = cosineSimilarity(a, b);
    return sim < this.tau;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Fallback: token-level edit-distance predicate (the v1 implementation).
 * Preserved for deployments without embedding infrastructure. Documented in
 * the changelog as the legacy mode.
 */
export class EditDistanceMergePredicate {
  constructor(private readonly threshold: number = 0.30) {}

  async materiallyChanged(pre: string, post: string): Promise<boolean> {
    if (!pre || !post) return true;
    const preTokens = new Set(pre.toLowerCase().split(/\s+/));
    const postTokens = new Set(post.toLowerCase().split(/\s+/));
    const intersection = new Set([...preTokens].filter((t) => postTokens.has(t)));
    const union = new Set([...preTokens, ...postTokens]);
    const jaccardSim = union.size === 0 ? 1 : intersection.size / union.size;
    return 1 - jaccardSim >= this.threshold;
  }
}
