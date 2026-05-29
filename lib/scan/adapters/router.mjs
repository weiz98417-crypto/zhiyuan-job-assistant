// @ts-check
/** Adapter registry — maps ats_type → adapter instance */

import { greenhouseAdapter } from './greenhouse.mjs';
import { leverAdapter } from './lever.mjs';
import { mokaAdapter } from './moka.mjs';
import { beisenAdapter } from './beisen.mjs';
import { customAdapter } from './custom.mjs';

/** @type {Record<string, import('./types.mjs').ScanAdapter>} */
const adapters = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  moka: mokaAdapter,
  beisen: beisenAdapter,
  custom: customAdapter,
};

/**
 * @param {string} atsType
 * @returns {import('./types.mjs').ScanAdapter}
 */
export function getAdapter(atsType) {
  const a = adapters[atsType];
  if (!a) throw new Error(`Unknown ats_type: "${atsType}". Available: ${Object.keys(adapters).join(', ')}`);
  return a;
}

export { adapters };
