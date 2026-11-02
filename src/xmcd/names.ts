/**
 * MathMath names its functions its own way. Mathcad sheets keep Mathcad's names on import: where the
 * meaning is the same, this table can translate them; where it isn't, the sheet says what to do instead.
 */
export const MATHCAD_FUNCTIONS: Record<string, string> = {};

/**
 * Mathcad's file functions read paths on Mathcad's machine, which a browser can't. They stay in the
 * sheet, grayed, with advice to load the file with Files instead.
 */
export const MATHCAD_FILE_FUNCTIONS = new Set([
  'READRGB', 'READBMP', 'READ_IMAGE', 'READ_RED', 'READ_GREEN', 'READ_BLUE', 'READ_HLS', 'READ_HSV',
  'READBIN', 'READPRN', 'READ', 'READFILE', 'WRITERGB', 'WRITEBMP', 'WRITEPRN', 'WRITEBIN', 'WRITE', 'APPENDPRN',
]);

export const translateFunction = (name: string): string => MATHCAD_FUNCTIONS[name] ?? name;
