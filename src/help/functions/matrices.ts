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

const M2 = 'A\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}';

export const MATRICES: Entry[] = [
  {
    name: 'augment', group: 'Vectors and matrices', usage: 'augment(A, B, …)', mathcad: true,
    summary: 'Joins matrices or vectors side by side into one wider matrix.',
    details: ['Takes any number of arguments, which must all have the same number of rows. Use [[stack]] to join them top to bottom.'],
    errors: ['Arguments with different numbers of rows.'],
    example: [M2, 'B\\coloneq \\begin{pmatrix}5\\\\6\\end{pmatrix}', '\\mathrm{augment}\\left(A,B\\right)='],
  },
  {
    name: 'stack', group: 'Vectors and matrices', usage: 'stack(A, B, …)', mathcad: true,
    summary: 'Joins matrices or vectors one above the other into one taller matrix.',
    details: ['Takes any number of arguments, which must all have the same number of columns. Use [[augment]] to join them side by side.'],
    errors: ['Arguments with different numbers of columns.'],
    example: [M2, 'B\\coloneq \\begin{pmatrix}5&6\\end{pmatrix}', '\\mathrm{stack}\\left(A,B\\right)='],
  },
  {
    name: 'cols', group: 'Vectors and matrices', usage: 'cols(A)', mathcad: true,
    summary: 'The number of columns in a matrix.',
    details: ['A vector written as a column has one column. See [[rows]] for the other way.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}', '\\mathrm{cols}\\left(A\\right)='],
  },
  {
    name: 'rows', group: 'Vectors and matrices', usage: 'rows(A)', mathcad: true,
    summary: 'The number of rows in a matrix.',
    details: ['A column vector\'s rows are its elements. See [[cols]] for the other way.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}', '\\mathrm{rows}\\left(A\\right)='],
  },
  {
    name: 'length', group: 'Vectors and matrices', usage: 'length(v)', mathcad: true,
    summary: 'The number of elements in a vector, which is its number of rows.',
    details: ['For the size of a matrix use [[rows]] and [[cols]].'],
    errors: ['A matrix or a row vector: v must be a single column.'],
    example: ['v\\coloneq \\begin{pmatrix}7\\\\8\\\\9\\\\10\\end{pmatrix}', '\\mathrm{length}\\left(v\\right)='],
  },
  {
    name: 'last', group: 'Vectors and matrices', usage: 'last(v)', mathcad: true,
    summary: 'The index of the last element of a vector.',
    errors: ['A matrix or a row vector: v must be a single column.'],
    details: ['It counts from ORIGIN, so it is the length minus 1 when ORIGIN is 0. It is handy as the top of a range: i := 0..last(v).'],
    example: ['v\\coloneq \\begin{pmatrix}7\\\\8\\\\9\\\\10\\end{pmatrix}', '\\mathrm{last}\\left(v\\right)=', 'v_{\\mathrm{last}\\left(v\\right)}='],
  },
  {
    name: 'diag', group: 'Vectors and matrices', usage: 'diag(v)', mathcad: true,
    summary: 'A square matrix with the vector\'s elements on its diagonal and zeros elsewhere.',
    errors: ['An argument that is not a vector.'],
    example: ['\\mathrm{diag}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}\\right)='],
  },
  {
    name: 'identity', group: 'Vectors and matrices', usage: 'identity(n)', mathcad: true,
    summary: 'The n by n identity matrix: ones on the diagonal, zeros elsewhere.',
    example: ['\\mathrm{identity}\\left(3\\right)='],
  },
  {
    name: 'matrix', group: 'Vectors and matrices', usage: 'matrix(m, n, f)', mathcad: true,
    summary: 'An m by n matrix whose element in row i and column j is f(i, j).',
    details: ['f is a function of two arguments, defined elsewhere in the worksheet. The row and column numbers it gets count from ORIGIN, so with ORIGIN = 0 the first element is f(0, 0).'],
    errors: ['A third argument that is not a function.'],
    example: ['f\\left(i,j\\right)\\coloneq 10\\cdot i+j', '\\mathrm{matrix}\\left(3,2,f\\right)='],
  },
  {
    name: 'submatrix', group: 'Vectors and matrices', usage: 'submatrix(A, ir, jr, ic, jc)', mathcad: true,
    summary: 'The block of A from row ir to row jr and from column ic to column jc, both ends included.',
    details: ['The row and column numbers count from ORIGIN. For a vector, use column 0 for both column arguments (with ORIGIN = 0).'],
    errors: ['A block that reaches outside the matrix.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{pmatrix}', '\\mathrm{submatrix}\\left(A,1,2,0,1\\right)='],
  },
  {
    name: 'reverse', group: 'Vectors and matrices', usage: 'reverse(A)', mathcad: true,
    summary: 'The rows of a vector or matrix in the opposite order.',
    details: ['Applied to a vector it reverses the elements. Applied to a matrix it flips the matrix top to bottom, keeping each row as it is.'],
    example: ['\\mathrm{reverse}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}\\right)='],
  },
  {
    name: 'sort', group: 'Vectors and matrices', usage: 'sort(v)', mathcad: true,
    summary: 'The elements of a vector in ascending order.',
    details: ['For descending order, apply [[reverse]] to the result. To sort a matrix by a column or row, see [[csort]] and [[rsort]].'],
    errors: ['Complex elements.'],
    example: ['\\mathrm{sort}\\left(\\begin{pmatrix}3\\\\1\\\\2\\end{pmatrix}\\right)=', '\\mathrm{reverse}\\left(\\mathrm{sort}\\left(\\begin{pmatrix}3\\\\1\\\\2\\end{pmatrix}\\right)\\right)='],
  },
  {
    name: 'csort', group: 'Vectors and matrices', usage: 'csort(A, c)', mathcad: true,
    summary: 'The rows of A, rearranged so that column c is in ascending order.',
    details: ['Each row moves as a whole, so the rows stay intact. The column number c counts from ORIGIN. Rows with equal values in column c keep their order.'],
    errors: ['A column number outside the matrix.'],
    example: ['A\\coloneq \\begin{pmatrix}3&10\\\\1&20\\\\2&30\\end{pmatrix}', '\\mathrm{csort}\\left(A,0\\right)='],
  },
  {
    name: 'rsort', group: 'Vectors and matrices', usage: 'rsort(A, r)', mathcad: true,
    summary: 'The columns of A, rearranged so that row r is in ascending order.',
    details: ['Each column moves as a whole. The row number r counts from ORIGIN. It is [[csort]] turned on its side.'],
    errors: ['A row number outside the matrix.'],
    example: ['A\\coloneq \\begin{pmatrix}3&1&2\\\\10&20&30\\end{pmatrix}', '\\mathrm{rsort}\\left(A,0\\right)='],
  },
  {
    name: 'tr', group: 'Vectors and matrices', usage: 'tr(A)', mathcad: true,
    summary: 'The trace of a matrix: the sum of the elements on its main diagonal.',
    units: 'The result has the matrix\'s units.',
    example: [M2, '\\mathrm{tr}\\left(A\\right)='],
  },
  {
    name: 'rank', group: 'Linear algebra', usage: 'rank(A)', mathcad: true,
    summary: 'The rank of a matrix: how many of its rows are independent.',
    details: ['It is found by row reduction (see [[rref]]), counting the nonzero rows. Values near zero count as zero.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2\\\\2&4\\end{pmatrix}', '\\mathrm{rank}\\left(A\\right)='],
  },
  {
    name: 'det', group: 'Linear algebra', usage: 'det(A)', mathcad: true,
    summary: 'The determinant of a square matrix.',
    details: ['A determinant of 0 means the matrix has no inverse.'],
    units: 'The result has the matrix\'s units raised to the number of rows.',
    errors: ['A matrix that is not square.'],
    example: [M2, '\\mathrm{det}\\left(A\\right)='],
  },
  {
    name: 'norm1', group: 'Linear algebra', usage: 'norm1(A)', mathcad: true,
    summary: 'The L1 norm of a matrix: its largest column sum of absolute values.',
    details: ['See [[normi]] for the largest row sum, [[norm2]] for the spectral norm and [[norme]] for the Euclidean norm.'],
    example: [M2, '\\mathrm{norm1}\\left(A\\right)='],
  },
  {
    name: 'norm2', group: 'Linear algebra', usage: 'norm2(A)', mathcad: true,
    summary: 'The L2 (spectral) norm of a matrix: its largest singular value.',
    details: ['See [[svds]] for all the singular values.'],
    example: ['A\\coloneq \\begin{pmatrix}3&0\\\\0&4\\end{pmatrix}', '\\mathrm{norm2}\\left(A\\right)='],
  },
  {
    name: 'norme', group: 'Linear algebra', usage: 'norme(A)', mathcad: true,
    summary: 'The Euclidean (Frobenius) norm of a matrix or vector: the square root of the sum of the squares of all its elements.',
    example: ['\\mathrm{norme}\\left(\\begin{pmatrix}3\\\\4\\end{pmatrix}\\right)=', '\\mathrm{norme}\\left(\\begin{pmatrix}1&2\\\\2&4\\end{pmatrix}\\right)='],
  },
  {
    name: 'normi', group: 'Linear algebra', usage: 'normi(A)', mathcad: true,
    summary: 'The infinity norm of a matrix: its largest row sum of absolute values.',
    details: ['See [[norm1]] for the largest column sum.'],
    example: [M2, '\\mathrm{normi}\\left(A\\right)='],
  },
  {
    name: 'cond1', group: 'Linear algebra', usage: 'cond1(A)', mathcad: true,
    summary: 'The condition number of a square matrix in the L1 norm: norm1(A)·norm1(A⁻¹).',
    details: ['A large number means that solving with the matrix magnifies errors. The smallest possible value is 1.'],
    errors: ['A matrix that is not square, or has no inverse.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&1\\end{pmatrix}', '\\mathrm{cond1}\\left(A\\right)='],
  },
  {
    name: 'cond2', group: 'Linear algebra', usage: 'cond2(A)', mathcad: true,
    summary: 'The condition number of a matrix in the L2 norm: the largest singular value over the smallest.',
    details: ['See [[cond1]] for what the number means.'],
    example: ['A\\coloneq \\begin{pmatrix}6&0\\\\0&2\\end{pmatrix}', '\\mathrm{cond2}\\left(A\\right)='],
  },
  {
    name: 'conde', group: 'Linear algebra', usage: 'conde(A)', mathcad: true,
    summary: 'The condition number of a square matrix in the Euclidean norm: norme(A)·norme(A⁻¹).',
    details: ['See [[cond1]] for what the number means.'],
    errors: ['A matrix that is not square, or has no inverse.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&2\\end{pmatrix}', '\\mathrm{conde}\\left(A\\right)='],
  },
  {
    name: 'condi', group: 'Linear algebra', usage: 'condi(A)', mathcad: true,
    summary: 'The condition number of a square matrix in the infinity norm: normi(A)·normi(A⁻¹).',
    details: ['See [[cond1]] for what the number means.'],
    errors: ['A matrix that is not square, or has no inverse.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&1\\end{pmatrix}', '\\mathrm{condi}\\left(A\\right)='],
  },
  {
    name: 'eigenvals', group: 'Linear algebra', usage: 'eigenvals(A)', mathcad: true,
    summary: 'A column vector of the eigenvalues of a square matrix.',
    details: ['The values can be complex, as for a rotation. [[eigenvecs]] gives the matching eigenvectors.'],
    errors: ['A matrix that is not square, or whose values fail to converge.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&3\\end{pmatrix}', '\\mathrm{eigenvals}\\left(A\\right)='],
  },
  {
    name: 'eigenvec', group: 'Linear algebra', usage: 'eigenvec(A, z)', mathcad: true,
    summary: 'The unit-length eigenvector of A for the eigenvalue z.',
    details: ['z must be an eigenvalue of A, as [[eigenvals]] gives. A real vector comes back with its first nonzero element positive.'],
    errors: ['A value z that is not an eigenvalue of the matrix.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&3\\end{pmatrix}', '\\mathrm{eigenvec}\\left(A,3\\right)='],
  },
  {
    name: 'eigenvecs', group: 'Linear algebra', usage: 'eigenvecs(A)', mathcad: true,
    summary: 'A matrix whose columns are the unit-length eigenvectors of A, in the order [[eigenvals]] lists the values.',
    details: [
      'Found by LAPACK\'s method, which settles their signs. Each has unit length. A complex vector is turned so that its largest element is real, and the vectors of a complex-conjugate pair of eigenvalues are conjugates.',
      'A column\'s sign can differ from [[eigenvec]]\'s, which finds one vector its own way. For a repeated eigenvalue of a matrix without enough independent eigenvectors, two columns come out nearly parallel.',
    ],
    errors: ['A matrix that is not square, or that has units.'],
    example: ['A\\coloneq \\begin{pmatrix}2&0\\\\0&3\\end{pmatrix}', '\\mathrm{eigenvecs}\\left(A\\right)='],
  },
  {
    name: 'genvals', group: 'Linear algebra', usage: 'genvals(M, N)', mathcad: true,
    summary: 'The generalized eigenvalues of M and N: the values λ for which M·x = λ·N·x has a solution x other than 0.',
    details: [
      'The problem of vibration, K·x = ω²·M·x with stiffness K and mass M, and of buckling. When N is the identity they are [[eigenvals]]. Found by LAPACK\'s QZ method, which settles their order.',
      'If N is singular some λ are infinite: for real matrices they come back as 1.79769·10³⁰⁸, the largest number, with the sign of the infinity, and for complex ones as NaN. The values can be complex. [[genvecs]] gives the vectors.',
    ],
    units: 'The values are in M\'s units divided by N\'s.',
    errors: ['Matrices that are not square, or not the same size.'],
    example: ['K\\coloneq \\begin{pmatrix}2&-1\\\\-1&1\\end{pmatrix}', 'M\\coloneq \\begin{pmatrix}2&0\\\\0&1\\end{pmatrix}', '\\mathrm{genvals}\\left(K,M\\right)='],
  },
  {
    name: 'genvecs', group: 'Linear algebra', usage: 'genvecs(M, N, ["L"])', mathcad: true,
    summary: 'A matrix whose columns are the generalized eigenvectors of M and N, in the order [[genvals]] lists the values.',
    details: [
      'Column k is an x with M·x = λ_k·N·x. Each is scaled so that its largest element, by |real part| + |imaginary part|, is ±1, rather than to unit length.',
      'With "L", the left eigenvectors instead: the y with yᴴ·M = λ·yᴴ·N.',
    ],
    units: 'The vectors have no units.',
    errors: ['Matrices that are not square, or not the same size.', 'A third argument other than "L" or "R".'],
    example: ['K\\coloneq \\begin{pmatrix}2&-1\\\\-1&1\\end{pmatrix}', 'M\\coloneq \\begin{pmatrix}2&0\\\\0&1\\end{pmatrix}', '\\mathrm{genvecs}\\left(K,M\\right)='],
  },
  {
    name: 'cholesky', group: 'Linear algebra', usage: 'cholesky(A)', mathcad: true,
    summary: 'The lower-triangular matrix L with L·Lᵀ = A, for a symmetric positive definite A.',
    details: ['Only the lower triangle of A is read.'],
    errors: ['A matrix with units.', 'A matrix that is not square, or not positive definite.'],
    example: ['A\\coloneq \\begin{pmatrix}4&2\\\\2&5\\end{pmatrix}', 'L\\coloneq \\mathrm{cholesky}\\left(A\\right)', 'L='],
  },
  {
    name: 'lu', group: 'Linear algebra', usage: 'lu(A)', mathcad: true,
    summary: 'The LU decomposition of a square matrix: the matrices P, L and U side by side, with P·A = L·U.',
    details: ['P is a permutation matrix (rows swapped for stability), L is lower triangular with ones on its diagonal and U is upper triangular. They come back as one matrix three times as wide as A. Pick each out with [[submatrix]].'],
    errors: ['A matrix with units.', 'A matrix that is not square.'],
    example: ['A\\coloneq \\begin{pmatrix}4&2\\\\2&5\\end{pmatrix}', '\\mathrm{lu}\\left(A\\right)='],
  },
  {
    name: 'qr', group: 'Linear algebra', usage: 'qr(A)', mathcad: true,
    summary: 'The QR decomposition: the orthogonal Q and the upper-triangular R side by side, with A = Q·R.',
    details: ['For an m by n matrix, Q is m by m and R is m by n, joined into one m by (m+n) matrix. The diagonal of R is not negative. Pick each out with [[submatrix]].'],
    errors: ['A matrix with units.'],
    example: ['A\\coloneq \\begin{pmatrix}3&0\\\\4&5\\end{pmatrix}', '\\mathrm{qr}\\left(A\\right)='],
  },
  {
    name: 'svd', group: 'Linear algebra', usage: 'svd(A)', mathcad: true,
    summary: 'The singular value decomposition of A: the matrices U and V stacked one above the other, with A = U·diag(s)·Vᵀ.',
    details: ['For an m by n matrix, U is m by n and V is n by n, so the result has m+n rows. The values s are in descending order and come from [[svds]]. Each column of U has a positive first nonzero element, which matches the reference\'s svd on some matrices but not all: for signs that match it, use [[svd2]].'],
    errors: ['A matrix with fewer rows than columns.'],
    example: ['A\\coloneq \\begin{pmatrix}3&0\\\\0&2\\end{pmatrix}', '\\mathrm{svd}\\left(A\\right)='],
  },
  {
    name: 'svd2', group: 'Linear algebra', usage: 'svd2(A)', mathcad: true,
    summary: 'The singular value decomposition A = U·diag(s)·Vᵀ, as a vector of three arrays: s, U and Vᵀ.',
    details: [
      'Pick the parts out with subscripts: s is svd2(A)₀, the singular values largest first; U is svd2(A)₁, m by n; and Vᵀ is svd2(A)₂, n by n, already transposed. A may be complex, and then the last part is V\'s conjugate transpose.',
      'Found by LAPACK\'s method, which settles the signs of the columns. Use it rather than the older [[svd]] and [[svds]], whose signs differ.',
    ],
    units: 'The singular values have A\'s units; U and Vᵀ have none. The reference gives all three parts A\'s units.',
    errors: ['A matrix with fewer rows than columns.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2\\\\3&4\\\\5&6\\end{pmatrix}', 'S\\coloneq \\mathrm{svd2}\\left(A\\right)', 'S_{0}=', 'S_{1}\\cdot \\mathrm{diag}\\left(S_{0}\\right)\\cdot S_{2}='],
  },
  {
    name: 'svds', group: 'Linear algebra', usage: 'svds(A)', mathcad: true,
    summary: 'A column vector of the singular values of A, largest first.',
    details: ['The largest is [[norm2]] and the ratio of largest to smallest is [[cond2]]. [[svd]] gives the vectors too.'],
    example: ['A\\coloneq \\begin{pmatrix}3&0\\\\0&2\\end{pmatrix}', '\\mathrm{svds}\\left(A\\right)='],
  },
  {
    name: 'geninv', group: 'Linear algebra', usage: 'geninv(A)', mathcad: true,
    summary: 'The generalized (pseudo) inverse of A: the matrix that, multiplied on the left, gives the identity for a tall matrix of full column rank.',
    details: ['Useful for a least-squares fit, where `geninv(A)·b` is the best solution of A·x = b.'],
    units: 'The result has the matrix\'s units to the power −1.',
    errors: ['A matrix with fewer rows than columns.'],
    example: ['A\\coloneq \\begin{pmatrix}1\\\\1\\\\1\\\\1\\end{pmatrix}', 'b\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\6\\end{pmatrix}', '\\mathrm{geninv}\\left(A\\right)\\cdot b='],
  },
  {
    name: 'lsolve', group: 'Linear algebra', usage: 'lsolve(A, b)', mathcad: true,
    summary: 'The vector x that solves the linear system A·x = b.',
    details: ['A must be square and b a column vector with as many rows. For an over-determined fit use [[geninv]].'],
    units: 'The result has b\'s units divided by A\'s.',
    errors: ['A matrix that is not square.', 'A b that is not a vector as long as the matrix.', 'A singular matrix.'],
    example: ['A\\coloneq \\begin{pmatrix}2&1\\\\1&3\\end{pmatrix}', 'b\\coloneq \\begin{pmatrix}5\\\\10\\end{pmatrix}', '\\mathrm{lsolve}\\left(A,b\\right)='],
  },
  {
    name: 'rref', group: 'Linear algebra', usage: 'rref(A)', mathcad: true,
    summary: 'The reduced row echelon form of A, found by Gauss-Jordan elimination.',
    details: ['Append the right-hand side with [[augment]] to solve a system by hand. [[rank]] counts the nonzero rows.'],
    example: ['A\\coloneq \\begin{pmatrix}1&2&5\\\\3&4&11\\end{pmatrix}', '\\mathrm{rref}\\left(A\\right)='],
  },
  {
    name: 'lookup', group: 'Vectors and matrices', usage: 'lookup(z, A, B)', mathcad: true,
    summary: 'The values in B at the places where A holds z, as a vector.',
    details: [
      'They come in column order, top left first, and as a vector even when there\'s one. Numbers match within TOL, as an absolute difference; strings match exactly. B must be at least as big as A.',
    ],
    errors: ['No match.'],
    example: ['A\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\2\\end{pmatrix}', 'B\\coloneq \\begin{pmatrix}10\\\\20\\\\30\\\\40\\end{pmatrix}', '\\mathrm{lookup}\\left(2,A,B\\right)='],
  },
  {
    name: 'hlookup', group: 'Vectors and matrices', usage: 'hlookup(z, A, r)', mathcad: true,
    summary: 'The values in row r of A, in the columns whose first row holds z, as a vector.',
    details: [
      'Rows count from ORIGIN. Numbers match within TOL; strings exactly. See also [[vlookup]].',
    ],
    errors: ['No match.', 'A row number outside A.'],
    example: ['M\\coloneq \\begin{pmatrix}1&2&3\\\\10&20&30\\end{pmatrix}', '\\mathrm{hlookup}\\left(2,M,1\\right)='],
  },
  {
    name: 'vlookup', group: 'Vectors and matrices', usage: 'vlookup(z, A, c)', mathcad: true,
    summary: 'The values in column c of A, in the rows whose first column holds z, as a vector.',
    details: [
      'Columns count from ORIGIN. Numbers match within TOL; strings exactly. See also [[hlookup]].',
    ],
    errors: ['No match.', 'A column number outside A.'],
    example: ['M\\coloneq \\begin{pmatrix}1&10\\\\2&20\\\\3&30\\end{pmatrix}', '\\mathrm{vlookup}\\left(3,M,1\\right)='],
  },
  {
    name: 'match', group: 'Vectors and matrices', usage: 'match(z, A)', mathcad: true,
    summary: 'Where z is in A: the indices, as a vector.',
    details: [
      'For a vector, the index of each match, counted from ORIGIN; for a matrix, each match\'s (row, column), in column order. Numbers match within TOL; strings exactly.',
    ],
    errors: ['No match.'],
    example: ['A\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\2\\end{pmatrix}', '\\mathrm{match}\\left(2,A\\right)='],
  },
];
