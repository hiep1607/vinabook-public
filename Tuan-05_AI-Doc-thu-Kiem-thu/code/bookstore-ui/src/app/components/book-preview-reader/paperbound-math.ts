// Adapted from the user-supplied Paperbound book-math.js.
// Integrate strip tangents rather than rotating vertices around a rigid axis.
export const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export function sheetCurve(progress: number, width: number, strips = 48, corner = 0): number[][] {
  const p = clamp(progress), motion = Math.sin(Math.PI * p), pts = [[0, 0]];
  let x = 0, y = 0;
  for (let k = 1; k <= strips; k++) {
    const u = (k - .5) / strips;
    const rest = (1 - 2 * p) * (.14 * Math.exp(-u * 5) - .035);
    const bend = motion * (-.64 * Math.sin(u * Math.PI * .72) +
      .12 * Math.sin(u * Math.PI * 1.8) + corner * .18 * u * u);
    const theta = Math.PI * p + rest + bend;
    x += Math.cos(theta) * width / strips;
    y += Math.sin(theta) * width / strips;
    pts.push([x, y]);
  }
  return pts;
}
export function spread(turned: number, count: number): { left: number; right: number } {
  const left = 2 * turned - 1, right = 2 * turned;
  return { left: left >= 0 && left < count ? left : -1, right: right < count ? right : -1 };
}
export function maxTurns(count: number): number { return Math.floor(count / 2); }
export function releaseTarget(p: number, direction: number, velocity: number, commit: boolean): 0 | 1 {
  if (!commit) { return direction > 0 ? 0 : 1; }
  return direction > 0
    ? (p > .34 || (velocity < -.45 && p > .08) ? 1 : 0)
    : (p < .66 || (velocity > .45 && p < .92) ? 0 : 1);
}
