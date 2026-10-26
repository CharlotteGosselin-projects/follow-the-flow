// The one place that touches localStorage. The key and payload format are the same as
// every earlier version of the app, so existing data keeps working.

import { STORAGE_KEY } from '../lib/catalog.ts';
import type { Stored } from '../lib/crypto.ts';

export function loadStored(): Stored | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return raw && typeof raw === 'object' ? (raw as Stored) : null;
  } catch {
    return null;
  }
}

export function saveStored(payload: Stored) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
}
