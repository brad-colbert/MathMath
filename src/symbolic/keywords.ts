/** The symbolic keywords, as the Keywords menu lists them: name, whether it takes an argument, and a hint. */
export const KEYWORDS = [
  ['simplify', false, 'Simplify'], ['expand', false, 'Multiply out'], ['factor', false, 'Factor'], ['float', false, 'As a decimal, to 20 digits'],
  ['solve', true, 'Solve for a variable'], ['collect', true, 'Collect powers of a variable'], ['coeffs', true, 'List coefficients of a variable'],
  ['series', true, 'Series in a variable'], ['substitute', true, 'Substitute, as x=y+1'], ['parfrac', true, 'Partial fractions in a variable'],
  ['assume', true, 'Assume something, as x>0'],
  ['laplace', true, 'Laplace transform in a variable, as t; the result is in s'],
  ['invlaplace', true, 'Inverse Laplace transform in a variable, as s; the result is in t'],
  ['ztrans', true, 'z-transform in a variable, as n; the result is in z'],
  ['invztrans', true, 'Inverse z-transform in a variable, as z; the result is in n'],
] as const;
