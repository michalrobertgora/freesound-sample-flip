/**
 * The live onsets cache: the onsetsCache factory wired to real fetch and
 * the stored API key. Components import from here; tests target the
 * factory in ./onsetsCache with fake transports.
 */

import { apiKey } from "./apiKey";
import { createOnsetsCache } from "./onsetsCache";

const live = createOnsetsCache((url) => fetch(url), () => apiKey.value);

export const onsetsFor = live.onsetsFor;
export const ensureOnsets = live.ensureOnsets;
