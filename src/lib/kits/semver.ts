export const BUMPS = ["patch", "minor", "major"] as const;
export type Bump = (typeof BUMPS)[number];

function parse(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`invalid_semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function compareSemver(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function bumpSemver(v: string, bump: Bump): string {
  const [major, minor, patch] = parse(v);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Bumps from the highest existing version so a bump after a rollback never collides. */
export function nextVersion(existing: string[], bump: Bump): string {
  const highest = [...existing].sort(compareSemver).at(-1) ?? "0.0.0";
  return bumpSemver(highest, bump);
}
