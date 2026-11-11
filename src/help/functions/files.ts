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

import type { Entry } from '../types.js';

const ATTACH = 'Files reach a worksheet through Files on the toolbar, or Attach files… when the sheet says it needs some: the file is loaded into the sheet, kept by its name (capitals don\'t matter) and saved inside the worksheet.';

/** What the classic Mathcad file functions do here: nothing but explain. */
const MATHCAD_ONLY = (what: string, instead: string): string[] => [
  `In Mathcad this ${what}. Here it is recognized, so a worksheet that uses it opens with the name intact and goes back to Mathcad unchanged, but it doesn't run: a web page can't read files from a folder on the computer, and the line shows a note.`,
  instead,
];

const CONVERT = 'Convert, on the bar above the paper when a sheet has these, changes the call for you; Undo puts it back.';

const NAME_ONLY = 'The file is read on Mathcad\'s computer by its path, which doesn\'t exist for a worksheet in the browser.';

export const FILES: Entry[] = [
  {
    name: 'readImage', group: 'Files', usage: 'readImage("name")', mathcad: false, results: 'files',
    summary: 'An attached picture as a matrix of its red, green and blue values, 0 to 255, in three blocks side by side.',
    details: [
      ATTACH + ' The name can also be a web address starting with http:// or https://, if that picture is attached under it. A picture of 50 pixels wide and 40 high gives a 40 by 150 matrix: the red block, then green, then blue. Loading a picture with Files writes the `readImage` line for you, assigned to a name you choose.',
      'To work on the colors one by one, split the answer with [[imageChannels]]; [[toGray]] gives a gray image. Show a result as a picture with an image region. [[writeImage]] saves one.',
    ],
    errors: ['A name that isn\'t in quotes.', 'A folder path: only a file name or a web address is accepted.', 'A file that isn\'t attached to the worksheet, which says to load it with Files.'],
    example: ['P\\coloneq \\mathrm{readImage}\\left(\\text{"photo.png"}\\right)', 'G\\coloneq \\mathrm{toGray}\\left(P\\right)', '\\mathrm{ditherAtkinson}\\left(G,2\\right)'],
  },
  {
    name: 'writeImage', group: 'Files', usage: 'writeImage("name.png", M)', mathcad: false, results: 'files',
    summary: 'Saves an image matrix as a picture file, a .png, .jpg or .webp, and gives back the matrix.',
    details: [
      'A plain matrix is written as gray levels 0 to 255, and a vector of three matrices (R; G; B) as color. The file isn\'t written to a folder: the browser offers it to save, and the region shows the outcome. Give only a name, such as "result.png", because a web page can\'t choose where on the computer to write. A matrix with the color blocks side by side is gray to this function: split it into three with [[imageChannels]] first.',
    ],
    errors: ['A name that isn\'t in quotes.', 'A folder path, such as "C:/out.png".', 'Any ending but .png, .jpg, .jpeg or .webp.', 'Something that isn\'t an image: a matrix of plain numbers, or three of them.'],
    example: ['M\\coloneq \\begin{pmatrix}0&128\\\\255&64\\end{pmatrix}', 'W\\coloneq \\mathrm{writeImage}\\left(\\text{"result.png"},M\\right)'],
  },
  {
    name: 'readTable', group: 'Files', usage: 'readTable("name")', mathcad: false, results: 'files',
    summary: 'An attached data file, such as a CSV, as a matrix, one row for each line.',
    details: [
      ATTACH + ' Loading a data file with Files writes the `readTable` line for you; a Mathcad data-reading component in an imported sheet becomes one too.',
      'Each line is split at commas, or if there are none at tabs, or else at spaces. If every cell is a number the answer is a matrix of numbers. If any isn\'t, a cell that is a number stays one and the rest become strings, so a header row can come along with the data. An empty cell is 0. Text in double quotes keeps its commas.',
    ],
    errors: ['A name that isn\'t in quotes.', 'A folder path: only the name of an attached file.', 'A file that isn\'t attached.', 'A spreadsheet, .xls or .xlsx: save it as CSV and load that.', 'An empty file.'],
    example: ['D\\coloneq \\mathrm{readTable}\\left(\\text{"measurements.csv"}\\right)', 'D_{0,1}='],
  },
  {
    name: 'readWav', group: 'Files', usage: 'readWav("name.wav")', mathcad: false, results: 'files',
    summary: 'An attached WAV sound file as a matrix with a column for each channel, samples between −1 and 1.',
    details: [
      ATTACH + ' A mono file gives one column and a stereo file two, with a row for every sample. Samples of 8, 16, 24 and 32 bits and 32- or 64-bit floating point are read and all scaled to run from −1 to 1. [[wavRate]] gives the sampling rate.',
      'Pass a column to [[fft]] or the filters to work on the sound.',
    ],
    errors: ['A name that isn\'t in quotes.', 'A folder path.', 'A file that isn\'t attached.', 'A file that isn\'t a WAV file, or has no sound data, or uses a sample format other than those listed.'],
    example: ['S\\coloneq \\mathrm{readWav}\\left(\\text{"tone.wav"}\\right)', 'f_{s}\\coloneq \\mathrm{wavRate}\\left(\\text{"tone.wav"}\\right)', 'x\\coloneq \\mathrm{fft}\\left(S^{\\langle 0\\rangle }\\right)'],
  },
  {
    name: 'wavRate', group: 'Files', usage: 'wavRate("name.wav")', mathcad: false, results: 'files',
    summary: 'The sampling rate of an attached WAV file, in samples per second.',
    details: ['The answer carries the unit 1/s, so a time between samples is `1/wavRate("tone.wav")`. The file is attached as for [[readWav]], which gives its samples.'],
    units: 'The answer is in 1/s (hertz).',
    errors: ['A name that isn\'t in quotes.', 'A folder path.', 'A file that isn\'t attached, or isn\'t a readable WAV file.'],
    example: ['f_{s}\\coloneq \\mathrm{wavRate}\\left(\\text{"tone.wav"}\\right)', '\\Delta t\\coloneq \\frac{1}{f_{s}}'],
  },
  {
    name: 'wavInfo', group: 'Files', usage: 'wavInfo("name.wav")', mathcad: false, results: 'files',
    summary: 'Facts about an attached WAV file: its channels, samples a second, bits per sample and bytes a second, as a vector.',
    details: ['The same four numbers as Mathcad\'s GETWAVINFO, without units. [[readWav]] gives the samples and [[wavRate]] the rate with its unit.'],
    errors: ['A name that isn\'t in quotes.', 'A folder path.', 'A file that isn\'t attached, or isn\'t a readable WAV file.'],
    example: ['\\mathrm{wavInfo}\\left(\\text{"tone.wav"}\\right)='],
  },
  {
    name: 'READPRN', group: 'Files', usage: 'READPRN("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader for a data file as a matrix: recognized here, but refused; use [[readTable]].',
    details: [
      ...MATHCAD_ONLY('reads a text file of numbers into a matrix', `Attach the file with Files and use [[readTable]]: for a file whose numbers are separated one way throughout, all by commas or all by spaces, it gives the same matrix. ${CONVERT} It waits until the file is attached, to check.`),
    ],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['D\\coloneq \\mathrm{READPRN}\\left(\\text{"data.prn"}\\right)', 'D='],
  },
  {
    name: 'WRITEPRN', group: 'Files', usage: 'WRITEPRN("name") := M', mathcad: true, results: 'files',
    summary: 'Writes a matrix of numbers to a text data file, a line for each row, as Mathcad does.',
    details: ['As in Mathcad, it\'s written as a definition: `WRITEPRN("out.prn") := M`. The region shows a **Save** button that downloads the file, named without the folder in its path: a web page can\'t write to a folder on your computer, so the browser asks where it goes. The button saves the latest result, after any recalculation.', 'Numbers are written as Mathcad writes them by default: 4 significant figures, very large and small ones with an exponent, as 1.235e+005, each right-aligned in a column 8 characters wide. Values with units are written in base SI units. [[readTable]] reads such a file back.'],
    errors: ['A matrix of strings, nested arrays or complex numbers.'],
    example: ['M\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\mathrm{WRITEPRN}\\left(\\text{"out.prn"}\\right)\\coloneq M'],
  },
  {
    name: 'APPENDPRN', group: 'Files', usage: 'APPENDPRN("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s appender of a matrix to the end of a text file: recognized here, but refused.',
    details: [...MATHCAD_ONLY('adds a matrix to the end of a text data file', '[[WRITEPRN]] writes a new file instead.')],
    errors: ['Any call: it always gives the note about Files and doesn\'t write anything.'],
    example: ['M\\coloneq \\begin{pmatrix}5&6\\end{pmatrix}', '\\mathrm{APPENDPRN}\\left(\\text{"out.prn"},M\\right)'],
  },
  {
    name: 'READ', group: 'Files', usage: 'READ("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of the next value from a file, one for each line that uses it: recognized here, but refused.',
    details: [
      ...MATHCAD_ONLY('is a scalar reader: each line that uses it takes the next number from the named file, so it needs the file kept open and its place remembered', 'A sheet here has no such position in a file. Load the whole file with Files, as [[readTable]], and use its elements.'),
    ],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['a\\coloneq \\mathrm{READ}\\left(\\text{"values.dat"}\\right)', 'a='],
  },
  {
    name: 'WRITE', group: 'Files', usage: 'WRITE("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s writer of one value after another to a file, one for each line that uses it: recognized here, but refused.',
    details: [...MATHCAD_ONLY('is a scalar writer: each line that uses it adds the next number to the named file', 'There is nothing to replace it with here, and nothing is written.')],
    errors: ['Any call: it always gives the note about Files and doesn\'t write anything.'],
    example: ['\\mathrm{WRITE}\\left(\\text{"values.dat"},3\\right)'],
  },
  {
    name: 'READFILE', group: 'Files', usage: 'READFILE("path", "type")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a data file of a given type, such as a spreadsheet or text file: recognized here, but refused.',
    details: [...MATHCAD_ONLY('reads a data file, in the type you name, into a matrix', 'Load the file with Files. A text or CSV file becomes a [[readTable]] line; a spreadsheet needs saving as CSV first.')],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['D\\coloneq \\mathrm{READFILE}\\left(\\text{"table.csv"},\\text{"delimited"}\\right)', 'D='],
  },
  {
    name: 'READBIN', group: 'Files', usage: 'READBIN("path", "type", …)', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a binary file as a vector of numbers: recognized here, but refused.',
    details: [...MATHCAD_ONLY('reads the raw numbers of a binary file into a vector', 'A binary file of sound can be loaded with Files and read with [[readWav]]. Other binary files can\'t be read here.')],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['v\\coloneq \\mathrm{READBIN}\\left(\\text{"samples.bin"},\\text{"double"}\\right)', 'v='],
  },
  {
    name: 'WRITEBIN', group: 'Files', usage: 'WRITEBIN("path", "type", …)', mathcad: true, results: 'files',
    summary: 'Mathcad\'s writer of numbers as a binary file: recognized here, but refused.',
    details: [...MATHCAD_ONLY('writes numbers to a binary file', 'Nothing here writes binary data.')],
    errors: ['Any call: it always gives the note about Files and doesn\'t write anything.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}', '\\mathrm{WRITEBIN}\\left(\\text{"samples.bin"},\\text{"double"}\\right)'],
  },
  {
    name: 'READRGB', group: 'Files', usage: 'READRGB("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a picture as one matrix, the red, green and blue blocks side by side: recognized here, but refused; use [[readImage]].',
    details: [
      ...MATHCAD_ONLY('reads a picture file into one matrix three times as wide as the picture', `Attach the picture with Files and use [[readImage]]: it gives the same layout and numbers, so the rest of the sheet works as it did. ${CONVERT}`),
    ],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['P\\coloneq \\mathrm{READRGB}\\left(\\text{"photo.jpg"}\\right)', '\\mathrm{toGray}\\left(P\\right)'],
  },
  {
    name: 'READ_IMAGE', group: 'Files', usage: 'READ_IMAGE("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a picture as one matrix of gray levels: recognized here, but refused; use [[readImage]] and [[toGray]].',
    details: [...MATHCAD_ONLY('reads a picture file into a matrix of gray values', `Attach the picture with Files: round(toGray(readImage("name"))) gives the same gray levels, rounded to whole numbers as Mathcad\'s are. ${CONVERT}`)],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['G\\coloneq \\mathrm{READ\\_IMAGE}\\left(\\text{"photo.bmp"}\\right)', 'G='],
  },
  {
    name: 'READBMP', group: 'Files', usage: 'READBMP("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a bitmap file as a matrix of gray levels: recognized here, but refused; use [[readImage]] and [[toGray]].',
    details: [...MATHCAD_ONLY('reads a bitmap picture into a matrix of gray values', `Attach the picture with Files: round(toGray(readImage("name"))) gives the same gray levels, rounded to whole numbers as Mathcad\'s are. ${CONVERT}`)],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['G\\coloneq \\mathrm{READBMP}\\left(\\text{"photo.bmp"}\\right)', 'G='],
  },
  {
    name: 'WRITEBMP', group: 'Files', usage: 'WRITEBMP("name") := M', mathcad: true, results: 'files',
    summary: 'Writes a matrix of gray levels, 0 to 255, as a picture file, as Mathcad does.',
    details: ['As in Mathcad, it\'s written as a definition: `WRITEBMP("out.bmp") := M`. The region shows a **Save** button that downloads the file, named without the folder in its path: a web page can\'t write to a folder on your computer, so the browser asks where it goes. The button saves the latest result, after any recalculation.', 'A .bmp name gives a bitmap, as Mathcad writes; .png, .jpg and .webp give those. Any other kind, such as .gif, is saved as PNG. [[writeImage]] does the same as a function.'],
    errors: ['Something that isn\'t a matrix of numbers.'],
    example: ['M\\coloneq \\begin{pmatrix}0&255\\\\255&0\\end{pmatrix}', '\\mathrm{WRITEBMP}\\left(\\text{"out.bmp"}\\right)\\coloneq M'],
  },
  {
    name: 'WRITERGB', group: 'Files', usage: 'WRITERGB("name") := M', mathcad: true, results: 'files',
    summary: 'Writes a color picture file from one matrix with its red, green and blue blocks side by side, as Mathcad does.',
    details: ['As in Mathcad, it\'s written as a definition: `WRITERGB("out.bmp") := M`, where M is three times as wide as the picture, as [[READRGB]] and [[readImage]] give. The region shows a **Save** button that downloads the file, named without the folder in its path: a web page can\'t write to a folder on your computer, so the browser asks where it goes. The button saves the latest result, after any recalculation.', 'A .bmp name gives a bitmap; .png, .jpg and .webp give those; any other kind, such as .gif, is saved as PNG. For three separate matrices, use [[writeImage]].'],
    errors: ['A matrix whose width isn\'t a multiple of 3.'],
    example: ['C\\coloneq \\begin{pmatrix}255&0&0\\end{pmatrix}', '\\mathrm{WRITERGB}\\left(\\text{"red.bmp"}\\right)\\coloneq C'],
  },
  ...(['READ_RED', 'READ_GREEN', 'READ_BLUE'] as const).map((name): Entry => {
    const color = name === 'READ_RED' ? 'red' : name === 'READ_GREEN' ? 'green' : 'blue';
    const k = name === 'READ_RED' ? 0 : name === 'READ_GREEN' ? 1 : 2;
    return {
      name, group: 'Files', usage: `${name}("path")`, mathcad: true, results: 'files',
      summary: `Mathcad's reader of the ${color} values of a picture as a matrix: recognized here, but refused; use [[readImage]] and [[imageChannels]].`,
      details: [...MATHCAD_ONLY(`reads the ${color} channel of a picture file into a matrix`, `Attach the picture with Files: imageChannels(readImage("name"), ${k}) is the ${color} one, the channel numbered from ORIGIN. ${CONVERT}`)],
      errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
      example: [`C\\coloneq \\mathrm{${name.replace('_', '\\_')}}\\left(\\text{"photo.jpg"}\\right)`, 'C='],
    };
  }),
  ...(['READ_HLS', 'READ_HSV'] as const).map((name): Entry => {
    const [model, fn] = name === 'READ_HLS' ? ['hue, lightness and saturation', 'rgbToHls'] : ['hue, saturation and value', 'rgbToHsv'];
    return {
      name, group: 'Files', usage: `${name}("path")`, mathcad: true, results: 'files',
      summary: `Mathcad's reader of a picture as ${model}, packed side by side: recognized here, but refused; use [[readImage]] and [[${fn}]].`,
      details: [...MATHCAD_ONLY(`reads a picture file as ${model}, the hue in degrees and the others 0 to 255, three blocks side by side`, `Attach the picture with Files: ${fn}(readImage("name"), 360) gives the same numbers. ${CONVERT}`)],
      errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
      example: [`H\\coloneq \\mathrm{${name.replace('_', '\\_')}}\\left(\\text{"photo.jpg"}\\right)`, 'H='],
    };
  }),
  ...([['READ_HLS_HUE', 'hue, in degrees', 0], ['READ_HLS_LIGHT', 'lightness, 0 to 255', 1], ['READ_HLS_SAT', 'saturation, 0 to 255', 2],
    ['READ_HSV_HUE', 'hue, in degrees', 0], ['READ_HSV_SAT', 'saturation, 0 to 255', 1], ['READ_HSV_VALUE', 'value, 0 to 255', 2]] as const).map(([name, part, k]): Entry => {
    const fn = name.startsWith('READ_HLS') ? 'rgbToHls' : 'rgbToHsv';
    return {
      name, group: 'Files', usage: `${name}("path")`, mathcad: true, results: 'files',
      summary: `Mathcad's reader of a picture's ${part.split(',')[0]} in the ${name.startsWith('READ_HLS') ? 'HLS' : 'HSV'} model: recognized here, but refused; use [[readImage]], [[${fn}]] and [[imageChannels]].`,
      details: [...MATHCAD_ONLY(`reads the ${part} of a picture file as a matrix`, `Attach the picture with Files: imageChannels(${fn}(readImage("name"), 360), ${k}) gives the same numbers, the channel numbered from ORIGIN. ${CONVERT}`)],
      errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
      example: [`H\\coloneq \\mathrm{${name.replace(/_/g, '\\_')}}\\left(\\text{"photo.jpg"}\\right)`, 'H='],
    };
  }),
  {
    name: 'READWAV', group: 'Files', usage: 'READWAV("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s reader of a WAV sound file as a matrix of samples: recognized here, but refused; use [[readWav]].',
    details: [...MATHCAD_ONLY('reads a PCM WAV file of 8 or 16 bits into a matrix, a column per channel, as the raw samples: 0 to 255 for 8 bits and −32768 to 32767 for 16. It refuses other files', `Attach the file with Files: [[readWav]] gives the samples from −1 to 1, so 32768·readWav("name") is Mathcad\'s numbers for a 16-bit file and 128·readWav("name") + 128 for an 8-bit one. ${CONVERT} It waits until the file is attached, to know which.`)],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['S\\coloneq \\mathrm{READWAV}\\left(\\text{"tone.wav"}\\right)', 'S='],
  },
  {
    name: 'GETWAVINFO', group: 'Files', usage: 'GETWAVINFO("path")', mathcad: true, results: 'files',
    summary: 'Mathcad\'s facts about a WAV file: recognized here, but refused; use [[wavInfo]].',
    details: [...MATHCAD_ONLY('gives a WAV file\'s channels, samples a second, bits per sample and bytes a second', `Attach the file with Files: [[wavInfo]] gives the same four numbers. ${CONVERT}`)],
    errors: ['Any call: it always gives the note about Files and doesn\'t read anything.'],
    example: ['\\mathrm{GETWAVINFO}\\left(\\text{"tone.wav"}\\right)='],
  },
  {
    name: 'WRITEWAV', group: 'Files', usage: 'WRITEWAV("name", s, b) := M', mathcad: true, results: 'files',
    summary: 'Writes a matrix of samples as a WAV sound file, a column per channel, s samples a second and b bits a sample, as Mathcad does.',
    details: [
      'As in Mathcad, it\'s written as a definition: `WRITEWAV("out.wav", 8000, 16) := M`. The region shows a **Save** button that downloads the file, named without the folder in its path.',
      'The samples are Mathcad\'s raw numbers, as [[READWAV]] gives them: b from 1 to 8 writes bytes, 0 to 255, and 9 to 16 writes words, −32768 to 32767. Each value is cut to a whole number toward 0, and one out of range wraps round rather than stopping at the end, as in Mathcad: 40000 is written as −25536. For samples from −1 to 1, as [[readWav]] gives, multiply by 32767 first.',
    ],
    errors: ['b outside 1 to 16.', 'A sample rate that isn\'t a whole number above 0.', 'Complex numbers, units or nested arrays.'],
    example: ['k\\coloneq 0..799', 'S_{k}\\coloneq 10000\\cdot \\sin \\left(2\\cdot \\pi \\cdot 440\\cdot \\frac{k}{8000}\\right)', '\\mathrm{WRITEWAV}\\left(\\text{"tone.wav"},8000,16\\right)\\coloneq S'],
  },
  ...(['WRITE_HLS', 'WRITE_HSV'] as const).map((name): Entry => {
    const [model, fn] = name === 'WRITE_HLS' ? ['hue, lightness and saturation', 'hlsToRgb'] : ['hue, saturation and value', 'hsvToRgb'];
    return {
      name, group: 'Files', usage: `${name}("name") := M`, mathcad: true, results: 'files',
      summary: `Writes a color picture file from ${model}, as Mathcad does.`,
      details: [`As in Mathcad, it\'s written as a definition: \`${name}("out.bmp") := M\`, where M has three blocks side by side, the hue in degrees and the others 0 to 255, as [[${name.replace('WRITE', 'READ')}]] reads them. It writes what [[WRITERGB]] would of ${fn}(M, 360). The region shows a **Save** button that downloads the file.`],
      errors: ['A matrix whose width isn\'t a multiple of 3.'],
      example: ['M\\coloneq \\begin{pmatrix}0&128&255\\end{pmatrix}', `\\mathrm{${name.replace('_', '\\_')}}\\left(\\text{"red.bmp"}\\right)\\coloneq M`],
    };
  }),
];
