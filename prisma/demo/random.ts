/** Small deterministic PRNG (mulberry32) so demo data is reproducible for a given seed. */
export interface Random {
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
  const weightedPick = <T>(items: readonly T[], weightOf: (item: T) => number): T => {
    const total = items.reduce((sum, item) => sum + weightOf(item), 0);
    let threshold = next() * total;
    for (const item of items) {
      threshold -= weightOf(item);
      if (threshold <= 0) {
        return item;
      }
    }
    return items[items.length - 1] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = int(0, index);
      [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
    }
    return copy;
  };
  return { next, int, chance: (probability) => next() < probability, pick, weightedPick, shuffle };
}
