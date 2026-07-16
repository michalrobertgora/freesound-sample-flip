/**
 * Deterministic PRNG: xmur3 string hash seeding mulberry32.
 * Both are well-known public-domain algorithms. Everything here must be
 * bit-for-bit identical across browsers — only >>> / Math.imul integer ops.
 */

/** xmur3 hash — returns a function producing successive 32-bit seeds from a string. */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — fast 32-bit PRNG, returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PRNG seeded from an arbitrary string (the seed string of the week). */
export function seededRng(seedString: string): () => number {
  return mulberry32(xmur3(seedString)());
}

/**
 * Draw `n` distinct indices in [0, rangeSize), in draw order.
 * Deterministic given the rng. If rangeSize <= n, returns all indices 0..rangeSize-1.
 */
export function drawDistinctIndices(
  rng: () => number,
  n: number,
  rangeSize: number,
): number[] {
  if (rangeSize <= 0) return [];
  if (rangeSize <= n) return Array.from({ length: rangeSize }, (_, i) => i);
  const picked = new Set<number>();
  const out: number[] = [];
  while (out.length < n) {
    const idx = Math.floor(rng() * rangeSize);
    if (!picked.has(idx)) {
      picked.add(idx);
      out.push(idx);
    }
  }
  return out;
}

/**
 * Quantize a result count to two significant figures (floor), so small
 * mid-week changes in Freesound's total don't change the draw range —
 * and therefore don't change the whole set. E.g. 8431 → 8400, 256 → 250, 87 → 87.
 */
export function quantizeCount(count: number): number {
  if (count < 100) return count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(count)) - 1);
  return Math.floor(count / magnitude) * magnitude;
}
