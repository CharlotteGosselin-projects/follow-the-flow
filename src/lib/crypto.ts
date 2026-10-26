// Optional passphrase protection: AES-GCM 256 with a key derived by PBKDF2-SHA256.
// Uses the browser's built-in WebCrypto; nothing leaves the device.

import type { State } from './types.ts';

export const PBKDF2_ITERATIONS = 310000;

/** What's saved in localStorage: the data as is, or encrypted. */
export type Stored = { enc: false; data: unknown } | { enc: true; salt: string; iv: string; ct: string };

export interface Lock {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
}

export function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function unb64(str: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A new lock (fresh random salt) for a passphrase. */
export async function newLock(pass: string): Promise<Lock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(pass, salt), salt };
}

export async function seal(state: State, lock: Lock | null): Promise<Stored> {
  if (!lock) return { enc: false, data: state };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(state));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, lock.key, data);
  return { enc: true, salt: b64(lock.salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

/** Decrypt with a passphrase. Throws when the passphrase is wrong. */
export async function unseal(
  raw: Extract<Stored, { enc: true }>,
  pass: string,
): Promise<{ lock: Lock; data: unknown }> {
  const salt = unb64(raw.salt);
  const key = await deriveKey(pass, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, key, unb64(raw.ct));
  return { lock: { key, salt }, data: JSON.parse(new TextDecoder().decode(pt)) };
}
