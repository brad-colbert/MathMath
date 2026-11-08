// MathMath: math on paper, in the browser.
// Copyright (C) 2026 Pelican Labs, LLC
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
// General Public License as published by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
// License for more details.
//
// You should have received a copy of the GNU Affero General Public License along with this program. If not,
// see <https://www.gnu.org/licenses/>.

/**
 * Reads WAV files: PCM at 8, 16, 24 or 32 bits, and 32- or 64-bit floating point, including the extensible
 * header that multichannel and 24-bit files use. Samples come out between −1 and 1, a channel at a time.
 */
export interface DecodedAudio {
  /** Samples per second. */
  rate: number;
  bits: number;
  /** One array per channel, each scaled to −1 … 1. */
  channels: Float64Array[];
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/** The decoded audio, or a reason it can't be read. */
export function parseWav(bytes: Uint8Array): DecodedAudio | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return "it isn't a WAV file";
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let data: { at: number; length: number } | null = null;
  // Chunks follow one another, each padded to an even length; anything not needed is skipped.
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ' && size >= 16) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // The extensible header's sub-format GUID starts with the plain format code.
      if (format === EXTENSIBLE && size >= 40) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      data = { at: body, length: Math.min(size, bytes.length - body) };
    }
    at = body + size + (size % 2);
  }
  if (!channels || !rate) return 'its format chunk is missing';
  if (!data) return 'it has no sound data';
  if (format !== PCM && format !== FLOAT) return `its sample format (code ${format}) isn't PCM or floating point`;
  if (format === PCM && ![8, 16, 24, 32].includes(bits)) return `it uses ${bits}-bit samples; 8, 16, 24 and 32 are readable`;
  if (format === FLOAT && ![32, 64].includes(bits)) return `it uses ${bits}-bit floating-point samples; 32 and 64 are readable`;
  const width = bits / 8;
  const frames = Math.floor(data.length / (width * channels));
  const out = Array.from({ length: channels }, () => new Float64Array(frames));
  const read = (p: number): number => {
    if (format === FLOAT) return bits === 32 ? view.getFloat32(p, true) : view.getFloat64(p, true);
    switch (bits) {
      case 8: return (view.getUint8(p) - 128) / 128;
      case 16: return view.getInt16(p, true) / 32768;
      case 24: return ((view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16))) / 8388608;
      default: return view.getInt32(p, true) / 2147483648;
    }
  };
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) out[c]![f] = read(data.at + (f * channels + c) * width);
  }
  return { rate, bits, channels: out };
}

/** Whether an attached file is a WAV file, by its name or the type the browser gave it. */
export const isWavFile = (name: string, mime: string): boolean => /\.wav$/i.test(name) || /^audio\/(x-)?wav(e)?$/i.test(mime);
