/** Everything the help panel shows: entries by name, topics, and the examples' stored answers. */
import { CIRCUITS, ELECTRICAL, RF } from './functions/electrical.js';
import { CORE } from './functions/core.js';
import { FILES } from './functions/files.js';
import { IMAGES } from './functions/images.js';
import { MATRICES } from './functions/matrices.js';
import { SIGNAL } from './functions/signal.js';
import { SOLVING } from './functions/solving.js';
import { SYMBOLIC } from './functions/symbolic.js';
import { RESULTS } from './results.js';
import { TOPICS } from './topics.js';
import { type Entry, GROUPS, type Topic } from './types.js';

export { GROUPS, RESULTS, TOPICS };
export type { Entry, Topic };

export const ENTRIES: Entry[] = [...CORE, ...MATRICES, ...SOLVING, ...SIGNAL, ...IMAGES, ...FILES, ...ELECTRICAL, ...CIRCUITS, ...RF, ...SYMBOLIC];

/** Entries by every name they go by. */
export const BY_NAME = new Map<string, Entry>();
for (const e of ENTRIES) for (const n of [e.name, ...(e.also ?? [])]) BY_NAME.set(n, e);

export const TOPIC_BY_ID = new Map<string, Topic>(TOPICS.map((t) => [t.id, t]));
