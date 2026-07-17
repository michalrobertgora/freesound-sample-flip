/**
 * The live onsets cache: the onsetsCache factory wired to real fetch
 * (through the Worker proxy). Components import from here; tests target the
 * factory in ./onsetsCache with fake transports.
 */

import { createOnsetsCache } from "./onsetsCache";

const live = createOnsetsCache((url) => fetch(url));

export const onsetsFor = live.onsetsFor;
export const ensureOnsets = live.ensureOnsets;
