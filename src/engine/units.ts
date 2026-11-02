import { type Dim, NODIM } from './values.js';

export interface Unit { factor: number; dim: Dim; offset?: number }

const L = [1, 0, 0, 0, 0, 0, 0];
const M = [0, 1, 0, 0, 0, 0, 0];
const T = [0, 0, 1, 0, 0, 0, 0];
const I = [0, 0, 0, 1, 0, 0, 0];
const K = [0, 0, 0, 0, 1, 0, 0];
const MOL = [0, 0, 0, 0, 0, 1, 0];
const CD = [0, 0, 0, 0, 0, 0, 1];
const combo = (...parts: [number[], number][]): Dim => {
  const d = [0, 0, 0, 0, 0, 0, 0];
  for (const [b, p] of parts) b.forEach((v, i) => { d[i] = d[i]! + v * p; });
  return d;
};
const AREA = combo([L, 2]);
const VOL = combo([L, 3]);
const ACC = combo([L, 1], [T, -2]);
const VEL = combo([L, 1], [T, -1]);
const FORCE = combo([M, 1], [L, 1], [T, -2]);
const ENERGY = combo([M, 1], [L, 2], [T, -2]);
const POWER = combo([M, 1], [L, 2], [T, -3]);
const PRESSURE = combo([M, 1], [L, -1], [T, -2]);
const VOLT = combo([M, 1], [L, 2], [T, -3], [I, -1]);
const FREQ = combo([T, -1]);
const LUX = combo([CD, 1], [L, -2]);

const u = (factor: number, dim: Dim): Unit => ({ factor, dim });

/** Angles and solid angles are dimensionless, so lumen and candela share a dimension. */
export const UNITS: Record<string, Unit> = {
  m: u(1, L), cm: u(0.01, L), mm: u(1e-3, L), km: u(1e3, L), um: u(1e-6, L), 'μm': u(1e-6, L), nm: u(1e-9, L),
  ft: u(0.3048, L), in: u(0.0254, L), yd: u(0.9144, L), mi: u(1609.344, L), nmi: u(1852, L),
  s: u(1, T), sec: u(1, T), ms: u(1e-3, T), us: u(1e-6, T), ns: u(1e-9, T), min: u(60, T), hr: u(3600, T), day: u(86400, T),
  yr: u(31557600, T),
  kg: u(1, M), gm: u(1e-3, M), mg: u(1e-6, M), lb: u(0.45359237, M), oz: u(0.45359237 / 16, M), tonne: u(1000, M),
  A: u(1, I), mA: u(1e-3, I), K: u(1, K), R: u(5 / 9, K), mol: u(1, MOL), cd: u(1, CD), lm: u(1, CD), lx: u(1, LUX),
  rad: u(1, NODIM), deg: u(Math.PI / 180, NODIM), sr: u(1, NODIM),
  N: u(1, FORCE), kN: u(1e3, FORCE), lbf: u(4.4482216152605, FORCE), dyne: u(1e-5, FORCE),
  J: u(1, ENERGY), kJ: u(1e3, ENERGY), MJ: u(1e6, ENERGY), erg: u(1e-7, ENERGY), BTU: u(1055.05585262, ENERGY), cal: u(4.1868, ENERGY),
  W: u(1, POWER), mW: u(1e-3, POWER), kW: u(1e3, POWER), MW: u(1e6, POWER), GW: u(1e9, POWER), hp: u(745.69987158227022, POWER),
  Pa: u(1, PRESSURE), kPa: u(1e3, PRESSURE), MPa: u(1e6, PRESSURE), GPa: u(1e9, PRESSURE), bar: u(1e5, PRESSURE),
  atm: u(101325, PRESSURE), psi: u(6894.757293168, PRESSURE), torr: u(133.32236842105263, PRESSURE),
  V: u(1, VOLT), mV: u(1e-3, VOLT), kV: u(1e3, VOLT),
  Hz: u(1, FREQ), kHz: u(1e3, FREQ), MHz: u(1e6, FREQ), GHz: u(1e9, FREQ),
  L: u(1e-3, VOL), mL: u(1e-6, VOL), acre: u(4046.8564224, AREA), hectare: u(1e4, AREA),
  mph: u(0.44704, VEL), kph: u(1 / 3.6, VEL), knot: u(1852 / 3600, VEL),
  g: u(9.80665, ACC), c: u(299792458, VEL),
};

/** Long names used in stored results. */
const LONG: Record<string, string> = {
  meter: 'm', centimeter: 'cm', millimeter: 'mm', kilometer: 'km', nanometer: 'nm', foot: 'ft', inch: 'in', yard: 'yd',
  mile: 'mi', nautical_mile: 'nmi', second: 's', minute: 'min', hour: 'hr', kilogram: 'kg', gram: 'gm', ampere: 'A',
  kelvin: 'K', mole: 'mol', candela: 'cd', lumen: 'lm', lux: 'lx', radian: 'rad', degree: 'deg', steradian: 'sr',
  newton: 'N', joule: 'J', watt: 'W', pascal: 'Pa', kilopascal: 'kPa', volt: 'V', hertz: 'Hz',
  gravitational_acceleration: 'g',
};

const OFFSET: Record<string, Unit> = {
  degC: { factor: 1, dim: K, offset: 273.15 },
  degF: { factor: 5 / 9, dim: K, offset: (459.67 * 5) / 9 },
};

/** The short name for a unit as written in stored results: `centimeter` is `cm`. */
export const shortUnit = (name: string): string => ({ degC: '°C', degF: '°F' } as Record<string, string>)[name] ?? LONG[name] ?? name;

export const storedUnit = (name: string): Unit | undefined => OFFSET[name] ?? UNITS[LONG[name] ?? name];
