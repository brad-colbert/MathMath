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

import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { NO_FILES } from '../src/engine/files.js';
import { type Mat, str } from '../src/engine/values.js';
import { isWavFile, parseWav } from '../src/engine/wav.js';

/** A WAV file of the given frames (one array of samples per frame), written as the format says. */
function wav(frames: number[][], { rate = 8000, bits = 16, float = false, extensible = false, extra = false } = {}): Uint8Array {
  const channels = frames[0]!.length;
  const width = bits / 8;
  const data = new Uint8Array(frames.length * channels * width);
  const dv = new DataView(data.buffer);
  frames.forEach((f, i) => f.forEach((s, c) => {
    const at = (i * channels + c) * width;
    if (float) bits === 32 ? dv.setFloat32(at, s, true) : dv.setFloat64(at, s, true);
    else if (bits === 8) dv.setUint8(at, Math.round(s * 128 + 128));
    else if (bits === 16) dv.setInt16(at, Math.round(s * 32768), true);
    else if (bits === 24) {
      const v = Math.round(s * 8388608);
      dv.setUint8(at, v & 255);
      dv.setUint8(at + 1, (v >> 8) & 255);
      dv.setInt8(at + 2, v >> 16);
    } else dv.setInt32(at, Math.round(s * 2147483648), true);
  }));
  const fmtSize = extensible ? 40 : 16;
  const junk = extra ? 8 + 3 + 1 : 0;
  const out = new Uint8Array(12 + 8 + fmtSize + junk + 8 + data.length);
  const o = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((ch, k) => o.setUint8(at + k, ch.charCodeAt(0)));
  tag(0, 'RIFF');
  o.setUint32(4, out.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  o.setUint32(16, fmtSize, true);
  o.setUint16(20, extensible ? 0xfffe : float ? 3 : 1, true);
  o.setUint16(22, channels, true);
  o.setUint32(24, rate, true);
  o.setUint32(28, rate * channels * width, true);
  o.setUint16(32, channels * width, true);
  o.setUint16(34, bits, true);
  if (extensible) {
    o.setUint16(36, 22, true);
    o.setUint16(38, bits, true);
    o.setUint16(44, float ? 3 : 1, true);
  }
  let at = 20 + fmtSize;
  if (extra) {
    // An odd-sized chunk to skip, padded to an even length.
    tag(at, 'LIST');
    o.setUint32(at + 4, 3, true);
    at += 12;
  }
  tag(at, 'data');
  o.setUint32(at + 4, data.length, true);
  out.set(data, at + 8);
  return out;
}

const samples = [[0], [0.5], [-0.5], [0.25], [-1]];

describe('reading WAV files', () => {
  test.each([8, 16, 24, 32])('%i-bit PCM', (bits) => {
    const a = parseWav(wav(samples, { bits }));
    if (typeof a === 'string') throw new Error(a);
    expect(a.rate).toBe(8000);
    expect([...a.channels[0]!]).toEqual(samples.map((s) => s[0]));
  });
  test.each([32, 64])('%i-bit floating point', (bits) => {
    const a = parseWav(wav(samples, { bits, float: true }));
    if (typeof a === 'string') throw new Error(a);
    expect([...a.channels[0]!]).toEqual(samples.map((s) => s[0]));
  });
  test('the extensible header, two channels, and a chunk to skip', () => {
    const stereo = [[0, 0.5], [0.25, -0.25], [-1, 0.75]];
    const a = parseWav(wav(stereo, { bits: 24, extensible: true, extra: true, rate: 44100 }));
    if (typeof a === 'string') throw new Error(a);
    expect(a.rate).toBe(44100);
    expect([...a.channels[0]!]).toEqual([0, 0.25, -1]);
    expect([...a.channels[1]!]).toEqual([0.5, -0.25, 0.75]);
  });
  test('says why a file is not readable', () => {
    expect(parseWav(new TextEncoder().encode('hello there, not audio'))).toContain("isn't a WAV file");
    const odd = wav(samples);
    new DataView(odd.buffer).setUint16(20, 2, true);
    expect(parseWav(odd)).toContain('code 2');
  });
  test('is recognized by name or type', () => {
    expect(isWavFile('Tone.WAV', '')).toBe(true);
    expect(isWavFile('x', 'audio/x-wav')).toBe(true);
    expect(isWavFile('x', 'audio/wave')).toBe(true);
    expect(isWavFile('x.mp3', 'audio/mpeg')).toBe(false);
  });
});

describe('readWav and wavRate', () => {
  const decoded = parseWav(wav([[0, 0.5], [0.25, -0.25], [-1, 0.75]], { rate: 22050 }));
  const files = { ...NO_FILES, audio: (name: string) => (name === 'tone.wav' ? decoded : name === 'bad.wav' ? 'it has no sound data' : undefined) };
  const B = makeBuiltins(0, files);
  test('give a column per channel, and the sample rate in hertz', () => {
    const m = B.get('readWav')!.call([str('Tone.wav')]) as Mat;
    expect([m.rows, m.cols]).toEqual([3, 2]);
    expect([...m.re]).toEqual([0, 0.25, -1, 0.5, -0.25, 0.75]);
    const r = B.get('wavRate')!.call([str('tone.wav')]);
    expect(r).toMatchObject({ re: 22050, dim: [0, 0, -1, 0, 0, 0, 0] });
  });
  test('ask for a missing file, and explain an unreadable one', () => {
    expect(() => B.get('readWav')!.call([str('other.wav')])).toThrow(/isn't attached/);
    expect(() => B.get('readWav')!.call([str('bad.wav')])).toThrow(/no sound data/);
    expect(() => B.get('readWav')!.call([str('C:/sounds/tone.wav')])).toThrow(/folder path/);
  });
});
