/** Drops oldest inserted keys until size ≤ max — insertion order, not LRU by recency (intentional for a tiny cap). */
export const evictOldestMapEntriesToCap = <K, V>(map: Map<K, V>, maxEntries: number): void => {
  while (map.size > maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    map.delete(firstKey);
  }
};
