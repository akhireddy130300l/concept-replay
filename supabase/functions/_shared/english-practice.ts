// Shared by hourly practice and the recap so each learned phrase appears once.
export function distinctPhrases<T extends { word: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.word.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}