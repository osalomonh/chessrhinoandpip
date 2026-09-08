// An injectable source of randomness, so tests are deterministic.

export type RandomSource = {
  /** Returns an integer in [0, count). */
  nextIndex(count: number): number;
};

export const defaultRandom: RandomSource = {
  nextIndex(count: number): number {
    if (count <= 0) throw new RangeError("nextIndex requires a positive count");
    return Math.floor(Math.random() * count);
  },
};

/** Picks an index into a pool of the given size, excluding `excludeIndex`
 * (the entry played last time) when there is more than one candidate. This
 * is how "a different wrong entry" is enforced without ever repeating the
 * same index twice in a row, regardless of what the random source returns. */
export function pickPoolIndex(poolSize: number, excludeIndex: number | undefined, random: RandomSource): number {
  if (poolSize <= 0) throw new RangeError("pickPoolIndex requires a non-empty pool");
  if (poolSize === 1 || excludeIndex === undefined) {
    return random.nextIndex(poolSize);
  }
  const picked = random.nextIndex(poolSize - 1);
  return picked >= excludeIndex ? picked + 1 : picked;
}
