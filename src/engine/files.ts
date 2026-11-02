/** Files a worksheet reads, already decoded, so evaluation stays synchronous. */
export interface DecodedImage {
  width: number;
  height: number;
  /** Row by row, four bytes a pixel. */
  rgba: Uint8ClampedArray;
}

export interface Files {
  image(name: string): DecodedImage | undefined;
}

export const isWebAddress = (s: string): boolean => /^https?:\/\//i.test(s);

/** The key an attached file is kept under: a web address as given, a file name in lower case. */
export const fileKey = (s: string): string => (isWebAddress(s) ? s : s.toLowerCase());

export const NO_FILES: Files = { image: () => undefined };
