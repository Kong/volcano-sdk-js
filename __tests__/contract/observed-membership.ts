export function observedMembership(
  snapshots: readonly (readonly string[])[],
  initial: readonly string[],
  joined: readonly string[],
): boolean {
  const expected = [initial, joined, initial].map((members) => JSON.stringify(members));
  let index = 0;
  for (const state of snapshots) {
    if (JSON.stringify(state) === expected[index]) {
      index += 1;
    }
    if (index === expected.length) {
      return true;
    }
  }
  return false;
}
