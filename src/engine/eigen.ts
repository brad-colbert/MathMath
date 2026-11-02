import { EvalError, type Mat, newMat } from './values.js';

/** Reduce to upper Hessenberg form by stabilized elimination. */
function hessenberg(a: number[][]): void {
  const n = a.length;
  for (let m = 1; m < n - 1; m++) {
    let x = 0;
    let p = m;
    for (let j = m; j < n; j++) {
      if (Math.abs(a[j]![m - 1]!) > Math.abs(x)) {
        x = a[j]![m - 1]!;
        p = j;
      }
    }
    if (p !== m) {
      for (let j = m - 1; j < n; j++) [a[p]![j], a[m]![j]] = [a[m]![j]!, a[p]![j]!];
      for (let j = 0; j < n; j++) [a[j]![p], a[j]![m]] = [a[j]![m]!, a[j]![p]!];
    }
    if (x === 0) continue;
    for (let i = m + 1; i < n; i++) {
      const y = a[i]![m - 1]! / x;
      if (y === 0) continue;
      a[i]![m - 1] = 0;
      for (let j = m; j < n; j++) a[i]![j] = a[i]![j]! - y * a[m]![j]!;
      for (let j = 0; j < n; j++) a[j]![m] = a[j]![m]! + y * a[j]![i]!;
    }
  }
}

/** Eigenvalues of a real upper Hessenberg matrix by shifted QR iteration. */
function hessenbergQR(a: number[][]): { re: number[]; im: number[] } {
  const n = a.length;
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i]![j]!);
  let nn = n - 1;
  let t = 0;
  while (nn >= 0) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 1; l--) {
        const s = Math.abs(a[l - 1]![l - 1]!) + Math.abs(a[l]![l]!) || anorm;
        if (Math.abs(a[l]![l - 1]!) + s === s) {
          a[l]![l - 1] = 0;
          break;
        }
      }
      let x = a[nn]![nn]!;
      if (l === nn) {
        re[nn] = x + t;
        im[nn--] = 0;
      } else {
        let y = a[nn - 1]![nn - 1]!;
        let w = a[nn]![nn - 1]! * a[nn - 1]![nn]!;
        if (l === nn - 1) {
          const p0 = 0.5 * (y - x);
          const q0 = p0 * p0 + w;
          let z = Math.sqrt(Math.abs(q0));
          x += t;
          if (q0 >= 0) {
            z = p0 + (p0 >= 0 ? Math.abs(z) : -Math.abs(z));
            re[nn - 1] = re[nn] = x + z;
            if (z !== 0) re[nn] = x - w / z;
            im[nn - 1] = im[nn] = 0;
          } else {
            re[nn - 1] = re[nn] = x + p0;
            im[nn - 1] = z;
            im[nn] = -z;
          }
          nn -= 2;
        } else {
          if (its === 60) throw new EvalError('runtime', 'eigenvalues did not converge');
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 0; i <= nn; i++) a[i]![i] = a[i]![i]! - x;
            const s = Math.abs(a[nn]![nn - 1]!) + Math.abs(a[nn - 1]![nn - 2]!);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          its++;
          let m = nn - 2;
          let [p, q, r] = [0, 0, 0];
          for (; m >= l; m--) {
            const z = a[m]![m]!;
            const rr = x - z;
            const ss = y - z;
            p = (rr * ss - w) / a[m + 1]![m]! + a[m]![m + 1]!;
            q = a[m + 1]![m + 1]! - z - rr - ss;
            r = a[m + 2]![m + 1]!;
            const s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m]![m - 1]!) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1]![m - 1]!) + Math.abs(z) + Math.abs(a[m + 1]![m + 1]!));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i]![i - 2] = 0;
            if (i !== m + 2) a[i]![i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k]![k - 1]!;
              q = a[k + 1]![k - 1]!;
              r = k !== nn - 1 ? a[k + 2]![k - 1]! : 0;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            const norm = Math.sqrt(p * p + q * q + r * r);
            const s = p >= 0 ? norm : -norm;
            if (s === 0) continue;
            if (k === m) {
              if (l !== m) a[k]![k - 1] = -a[k]![k - 1]!;
            } else a[k]![k - 1] = -s * x;
            p += s;
            x = p / s;
            y = q / s;
            const z = r / s;
            q /= p;
            r /= p;
            for (let j = k; j <= nn; j++) {
              let v = a[k]![j]! + q * a[k + 1]![j]!;
              if (k !== nn - 1) {
                v += r * a[k + 2]![j]!;
                a[k + 2]![j] = a[k + 2]![j]! - v * z;
              }
              a[k + 1]![j] = a[k + 1]![j]! - v * y;
              a[k]![j] = a[k]![j]! - v * x;
            }
            const top = nn < k + 3 ? nn : k + 3;
            for (let i = l; i <= top; i++) {
              let v = x * a[i]![k]! + y * a[i]![k + 1]!;
              if (k !== nn - 1) {
                v += z * a[i]![k + 2]!;
                a[i]![k + 2] = a[i]![k + 2]! - v * r;
              }
              a[i]![k + 1] = a[i]![k + 1]! - v * q;
              a[i]![k] = a[i]![k]! - v;
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return { re, im };
}

export function eigenvalues(m: Mat): Mat {
  if (m.rows !== m.cols) throw new EvalError('runtime', 'array must be square');
  if (m.cells || m.im) throw new EvalError('unsupported', 'complex or nested array in eigenvals');
  const n = m.rows;
  const a = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => m.re[i + j * n]!));
  hessenberg(a);
  const { re, im } = hessenbergQR(a);
  const out = newMat(n, 1, m.dim);
  out.re.set(re);
  if (im.some((x) => x !== 0)) out.im = Float64Array.from(im);
  return out;
}
