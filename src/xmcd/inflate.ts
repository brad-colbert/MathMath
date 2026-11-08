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
 * Gzip decompression (RFC 1951 and 1952), synchronous so the importer can stay synchronous in the
 * browser too. It's small and slow, which suits the few kilobytes of a component's data.
 */

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman { count: Uint16Array; symbol: Uint16Array }

function huffman(lengths: ArrayLike<number>): Huffman {
  const count = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) count[lengths[i]!]!++;
  count[0] = 0;
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len]! + count[len]!;
  const symbol = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbol[offs[lengths[i]!]!++] = i;
  return { count, symbol };
}

const FIXED_LENGTHS = huffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)));
const FIXED_DISTANCES = huffman(new Array(30).fill(5));

export function inflateRaw(data: Uint8Array, start = 0): Uint8Array {
  let pos = start;
  let buf = 0;
  let have = 0;
  let out = new Uint8Array(Math.max(1024, data.length * 4));
  let size = 0;
  const put = (b: number): void => {
    if (size === out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[size++] = b;
  };
  const bits = (n: number): number => {
    while (have < n) {
      if (pos >= data.length) throw new Error('compressed data ends early');
      buf |= data[pos++]! << have;
      have += 8;
    }
    const v = buf & ((1 << n) - 1);
    buf >>>= n;
    have -= n;
    return v;
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const count = h.count[len]!;
      if (code - count < first) return h.symbol[index + (code - first)]!;
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('bad compressed data');
  };
  const codes = (lengths: Huffman, distances: Huffman): void => {
    for (;;) {
      let sym = decode(lengths);
      if (sym < 256) put(sym);
      else if (sym === 256) return;
      else {
        sym -= 257;
        if (sym >= 29) throw new Error('bad compressed data');
        const len = LBASE[sym]! + bits(LEXT[sym]!);
        const d = decode(distances);
        if (d >= 30) throw new Error('bad compressed data');
        const dist = DBASE[d]! + bits(DEXT[d]!);
        if (dist > size) throw new Error('bad compressed data');
        for (let i = 0; i < len; i++) put(out[size - dist]!);
      }
    }
  };
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      buf = 0;
      have = 0;
      if (pos + 4 > data.length) throw new Error('compressed data ends early');
      const len = data[pos]! | (data[pos + 1]! << 8);
      pos += 4;
      if (pos + len > data.length) throw new Error('compressed data ends early');
      for (let i = 0; i < len; i++) put(data[pos++]!);
    } else if (type === 1) {
      codes(FIXED_LENGTHS, FIXED_DISTANCES);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      const order = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) order[ORDER[i]!] = bits(3);
      const lencode = huffman(order);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const sym = decode(lencode);
        if (sym < 16) lengths[i++] = sym;
        else {
          let repeat: number;
          let value = 0;
          if (sym === 16) {
            if (i === 0) throw new Error('bad compressed data');
            value = lengths[i - 1]!;
            repeat = 3 + bits(2);
          } else if (sym === 17) repeat = 3 + bits(3);
          else repeat = 11 + bits(7);
          if (i + repeat > nlen + ndist) throw new Error('bad compressed data');
          while (repeat--) lengths[i++] = value;
        }
      }
      codes(huffman(lengths.subarray(0, nlen)), huffman(lengths.subarray(nlen)));
    } else throw new Error('bad compressed data');
  }
  return out.subarray(0, size);
}

export function gunzip(data: Uint8Array): Uint8Array {
  if (data[0] !== 0x1f || data[1] !== 0x8b || data[2] !== 8) throw new Error('not gzip data');
  const flags = data[3]!;
  let pos = 10;
  if (flags & 4) pos += 2 + (data[pos]! | (data[pos + 1]! << 8));
  if (flags & 8) while (data[pos++] !== 0);
  if (flags & 16) while (data[pos++] !== 0);
  if (flags & 2) pos += 2;
  return inflateRaw(data, pos);
}
