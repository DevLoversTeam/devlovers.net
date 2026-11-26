export function getAtPath(
  root: Record<string, unknown>,
  path: readonly string[]
): unknown {
  let current: unknown = root;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
