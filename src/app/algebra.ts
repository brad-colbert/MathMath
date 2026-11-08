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
 * The algebra engine. It lives on the page, not in the calculation worker, because that worker is
 * replaced on every edit and the engine takes half a second to start. Answers are cached, since a
 * sheet recalculates constantly and most of its symbolic regions haven't changed.
 */
import type { GiacRequest } from '../symbolic/giac.js';

const START_LIMIT = 30000;
const RUN_LIMIT = 20000;
const failure = (text: string): string => `ERROR ${text}`;

export class Algebra {
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;
  private cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  private inFlight: { finish: (out: string) => void } | null = null;
  /** Bumped by abort, so requests queued for a stopped calculation don't run. */
  private generation = 0;

  /** Never rejects: failures come back as `ERROR …`, and show on the region that asked. */
  ask(request: GiacRequest): Promise<string> {
    const key = JSON.stringify(request);
    const known = this.cache.get(key);
    if (known !== undefined) return Promise.resolve(known);
    const asked = this.generation;
    const run = this.queue.then(() => (asked === this.generation ? this.send(request, key) : failure('Stopped')));
    this.queue = run;
    return run;
  }

  /** Stops whatever's running. Only ending the worker can: Giac doesn't return until it's done. */
  abort(): void {
    this.generation++;
    if (!this.inFlight) return;
    this.worker?.terminate();
    this.worker = null;
    this.starting = null;
    this.inFlight.finish(failure('Stopped'));
    this.inFlight = null;
  }

  private start(): Promise<Worker> {
    this.starting ??= new Promise((resolve, reject) => {
      const worker = new Worker(`${import.meta.env.BASE_URL}giac/worker.js`);
      const give = (reason: string): void => {
        clearTimeout(timer);
        worker.terminate();
        this.starting = null;
        reject(new Error(reason));
      };
      // A blocked or missing engine sends nothing at all, so waiting needs a limit.
      const timer = setTimeout(() => give('The algebra engine did not start'), START_LIMIT);
      worker.onerror = () => give('The algebra engine could not load');
      worker.onmessage = (m: MessageEvent<{ ready?: boolean }>) => {
        if (!m.data.ready) return;
        clearTimeout(timer);
        this.worker = worker;
        resolve(worker);
      };
    });
    return this.starting;
  }

  private async send(request: GiacRequest, key: string): Promise<string> {
    let worker: Worker;
    try {
      worker = this.worker ?? (await this.start());
    } catch (err) {
      return failure((err as Error).message);
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      // A hard problem can run for ever, and only ending the worker stops it.
      const finish = (out: string): void => {
        clearTimeout(timer);
        this.inFlight = null;
        resolve(out);
      };
      const timer = setTimeout(() => {
        worker.terminate();
        this.worker = null;
        this.starting = null;
        finish(failure('This took too long'));
      }, RUN_LIMIT);
      this.inFlight = { finish };
      worker.onmessage = (m: MessageEvent<{ id: number; out: string }>) => {
        if (m.data.id !== id) return;
        this.cache.set(key, m.data.out);
        finish(m.data.out);
      };
      worker.postMessage({ id, ...request });
    });
  }
}
