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
const OHM = combo([M, 1], [L, 2], [T, -3], [I, -2]);
const SIEMENS = combo([M, -1], [L, -2], [T, 3], [I, 2]);
const FARAD = combo([M, -1], [L, -2], [T, 4], [I, 2]);
const HENRY = combo([M, 1], [L, 2], [T, -2], [I, -2]);
const COULOMB = combo([T, 1], [I, 1]);
const WEBER = combo([M, 1], [L, 2], [T, -2], [I, -1]);
const TESLA = combo([M, 1], [T, -2], [I, -1]);
const FIELD = combo([I, 1], [L, -1]);

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
  // Electrical units, as Mathcad 14 names them (probed): μ is the Greek letter, as Mathcad writes it.
  'Ω': u(1, OHM), 'kΩ': u(1e3, OHM), 'MΩ': u(1e6, OHM), ohm: u(1, OHM), S: u(1, SIEMENS), mho: u(1, SIEMENS),
  F: u(1, FARAD), 'μF': u(1e-6, FARAD), nF: u(1e-9, FARAD), pF: u(1e-12, FARAD),
  H: u(1, HENRY), mH: u(1e-3, HENRY), 'μH': u(1e-6, HENRY),
  C: u(1, COULOMB), mC: u(1e-3, COULOMB), 'μC': u(1e-6, COULOMB), nC: u(1e-9, COULOMB), pC: u(1e-12, COULOMB),
  Wb: u(1, WEBER), T: u(1, TESLA), gauss: u(1e-4, TESLA), G: u(1e-4, TESLA), Oe: u(1000 / (4 * Math.PI), FIELD),
  kA: u(1e3, I), 'μA': u(1e-6, I), nA: u(1e-9, I), pA: u(1e-12, I), 'μV': u(1e-6, VOLT), nV: u(1e-9, VOLT),
  'μs': u(1e-6, T), ps: u(1e-12, T), 'μW': u(1e-6, POWER), nW: u(1e-9, POWER),
  // MathMath's own, which Mathcad 14 lacks. VA and Wh are watts and joules, and show as W and J.
  'mΩ': u(1e-3, OHM), 'GΩ': u(1e9, OHM), mS: u(1e-3, SIEMENS), 'μS': u(1e-6, SIEMENS), mF: u(1e-3, FARAD),
  nH: u(1e-9, HENRY), pH: u(1e-12, HENRY), mT: u(1e-3, TESLA), 'μT': u(1e-6, TESLA), MV: u(1e6, VOLT),
  VA: u(1, POWER), kVA: u(1e3, POWER), MVA: u(1e6, POWER), Wh: u(3600, ENERGY), kWh: u(3.6e6, ENERGY),
  Ah: u(3600, COULOMB), mAh: u(3.6, COULOMB), eV: u(1.602176634e-19, ENERGY),
  // Typed without the Greek letter, as um and us are. mohm is milliohms and Mohm megohms.
  kohm: u(1e3, OHM), Mohm: u(1e6, OHM), mohm: u(1e-3, OHM), Gohm: u(1e9, OHM),
  uF: u(1e-6, FARAD), uH: u(1e-6, HENRY), uC: u(1e-6, COULOMB), uA: u(1e-6, I), uV: u(1e-6, VOLT),
  uW: u(1e-6, POWER), uS: u(1e-6, SIEMENS), uT: u(1e-6, TESLA),
};

/** Long names used in stored results. */
const LONG: Record<string, string> = {
  meter: 'm', centimeter: 'cm', millimeter: 'mm', kilometer: 'km', nanometer: 'nm', foot: 'ft', inch: 'in', yard: 'yd',
  mile: 'mi', nautical_mile: 'nmi', second: 's', minute: 'min', hour: 'hr', kilogram: 'kg', gram: 'gm', ampere: 'A',
  kelvin: 'K', mole: 'mol', candela: 'cd', lumen: 'lm', lux: 'lx', radian: 'rad', degree: 'deg', steradian: 'sr',
  newton: 'N', joule: 'J', watt: 'W', pascal: 'Pa', kilopascal: 'kPa', volt: 'V', hertz: 'Hz',
  ohm: 'Ω', farad: 'F', henry: 'H', coulomb: 'C', weber: 'Wb', tesla: 'T',
  gravitational_acceleration: 'g',
};

const OFFSET: Record<string, Unit> = {
  degC: { factor: 1, dim: K, offset: 273.15 },
  degF: { factor: 5 / 9, dim: K, offset: (459.67 * 5) / 9 },
};

/** The short name for a unit as written in stored results: `centimeter` is `cm`. */
export const shortUnit = (name: string): string => ({ degC: '°C', degF: '°F' } as Record<string, string>)[name] ?? LONG[name] ?? name;

export const storedUnit = (name: string): Unit | undefined => OFFSET[name] ?? UNITS[LONG[name] ?? name];
