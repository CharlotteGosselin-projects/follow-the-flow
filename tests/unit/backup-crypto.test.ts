import { describe, expect, it } from 'vitest';
import { emptyState, mergeBackup, sanitize, toBackup } from '../../src/lib/backup.ts';
import { newLock, seal, unseal } from '../../src/lib/crypto.ts';
import legacyEncrypted from '../fixtures/legacy-encrypted.json';

describe('sanitize', () => {
  it('returns an empty state for anything unusable', () => {
    expect(sanitize(null)).toEqual(emptyState());
    expect(sanitize('nope')).toEqual(emptyState());
  });

  it('keeps valid data, migrates old single moods and drops the rest', () => {
    const s = sanitize({
      days: ['2026-10-02', '2026-10-01', '2026-10-01', 'bad'],
      moods: {
        '2026-10-01': 'happy',
        '2026-10-02': ['sad', 'happy', 'nope'],
        '2026-10-03': ['nope'],
        x: ['happy'],
      },
      sleep: { '2026-10-01': 'insomnia', '2026-10-02': 'great' },
      habits: {
        '2026-10-01': { caffeine: 9, alcohol: 2, ghost: 1 },
        '2026-10-02': {},
        '2026-10-03': { ghost: 1 },
      },
      customHabits: [
        { id: 'c1', emoji: '🧘🏽‍♀️ extra', label: '  Yoga  ', since: '2026-10-01' },
        { id: 'BAD', label: 'x' },
      ],
      hiddenHabits: ['alcohol', 'alcohol', 'ghost'],
      chartPicks: ['sleep', 'sleep', 'ghost'],
      createdAt: '2026-10-01',
      lastExport: 'yesterday',
    });
    expect(s.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(s.moods).toEqual({ '2026-10-01': ['happy'], '2026-10-02': ['happy', 'sad'] });
    expect(s.sleep).toEqual({ '2026-10-01': 'insomnia' });
    expect(s.habits).toEqual({ '2026-10-01': { alcohol: 2 }, '2026-10-02': {} });
    expect(s.customHabits).toEqual([{ id: 'c1', emoji: '🧘🏽‍♀️', label: 'Yoga', since: '2026-10-01' }]);
    expect(s.hiddenHabits).toEqual(['alcohol']);
    expect(s.chartPicks).toEqual(['sleep', null, null]);
    expect(s).toMatchObject({ createdAt: '2026-10-01', lastExport: null, snoozeUntil: null });
  });
});

describe('backups', () => {
  it('writes a version 5 file', () => {
    expect(toBackup({ ...emptyState(), days: ['2026-10-01'] })).toMatchObject({
      app: 'follow-the-flow',
      version: 5,
      days: ['2026-10-01'],
    });
  });

  it('merges without losing anything', () => {
    const current = {
      ...emptyState(),
      days: ['2026-10-02'],
      moods: { '2026-10-01': ['sad' as const] },
      sleep: { '2026-10-01': 'insomnia' as const },
      habits: { '2026-10-01': { caffeine: 1 } },
    };
    const incoming = {
      ...emptyState(),
      days: ['2026-10-01', '2026-10-02'],
      moods: { '2026-10-01': ['happy' as const] },
      sleep: { '2026-10-01': 'poor' as const, '2026-10-02': 'poor' as const },
      habits: { '2026-10-01': { caffeine: 3, alcohol: 1 } },
    };
    const merged = mergeBackup(current, incoming);
    expect(merged.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(merged.moods).toEqual({ '2026-10-01': ['happy', 'sad'] });
    expect(merged.sleep).toEqual({ '2026-10-01': 'insomnia', '2026-10-02': 'poor' });
    expect(merged.habits).toEqual({ '2026-10-01': { caffeine: 3, alcohol: 1 } });
    expect(current.days).toEqual(['2026-10-02']); // the input is left unchanged
  });
});

describe('encryption', () => {
  it('round-trips and rejects a wrong passphrase', async () => {
    const state = { ...emptyState(), days: ['2026-10-01'] };
    const sealed = await seal(state, await newLock('correct horse'));
    expect(sealed.enc).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('2026-10-01');
    if (!sealed.enc) throw new Error('not encrypted');
    expect((await unseal(sealed, 'correct horse')).data).toEqual(state);
    await expect(unseal(sealed, 'wrong')).rejects.toThrow();
  });

  it('opens data encrypted by the current app', async () => {
    const { data } = await unseal(
      legacyEncrypted as { enc: true; salt: string; iv: string; ct: string },
      'correct horse',
    );
    expect(sanitize(data).days).toEqual(['2026-10-01']);
  });
});
