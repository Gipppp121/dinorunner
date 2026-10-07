// Shared between server and client: how fast a run can go, so the server can cap scores.
export const RUN = { v0: 360, accel: 7, vmax: 900, perPx: 0.025 };
export function speedAt(t) { return Math.min(RUN.vmax, RUN.v0 + RUN.accel * t); }
export function maxDistance(t) {
  const tc = (RUN.vmax - RUN.v0) / RUN.accel;
  if (t <= tc) return RUN.v0 * t + RUN.accel * t * t / 2;
  return RUN.v0 * tc + RUN.accel * tc * tc / 2 + RUN.vmax * (t - tc);
}
export function maxScore(t) { return Math.floor(maxDistance(t) * RUN.perPx); }
export const COLORS = ['#2fbf71', '#ff7a45', '#4f8dff', '#e84a8a', '#f5c518', '#8b6cff', '#22c3c3', '#ff5a5a'];
