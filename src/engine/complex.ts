/** Complex numbers as [re, im] pairs, for filter design and root finding. */
export type C = [number, number];
export const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const csqrt = (a: C): C => {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sqrt(Math.max(0, (r - a[0]) / 2));
  return [re, a[1] < 0 ? -im : im];
};
