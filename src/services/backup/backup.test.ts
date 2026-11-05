import { describe, expect, it } from 'vitest';
import { backupCounts, parseBackup, BACKUP_APP_ID } from './schema';
import { defaultSettings, emptyCompany, newDocument, starterServices } from '../domain';

function validBackup() {
  const s = defaultSettings();
  return {
    app: BACKUP_APP_ID,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      company: { ...emptyCompany(), legalName: 'Acme Software' },
      settings: s,
      clients: [],
      services: starterServices().slice(0, 3),
      documents: [newDocument('invoice', s, emptyCompany())],
      payments: [],
      recurrences: [],
    },
  };
}

describe('backup validation', () => {
  it('accepts a valid backup and reports counts', () => {
    const r = parseBackup(JSON.stringify(validBackup()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(backupCounts(r.backup.data)).toMatchObject({ Services: 3, Documents: 1, 'Company profile': 1 });
  });
  it('rejects non-JSON', () => {
    const r = parseBackup('not json');
    expect(r.ok).toBe(false);
  });
  it('rejects other JSON files', () => {
    const r = parseBackup(JSON.stringify({ hello: 'world' }));
    expect(r.ok === false && r.error).toMatch(/not a Software Invoice Studio backup/);
  });
  it('rejects unsupported future schema versions', () => {
    const r = parseBackup(JSON.stringify({ ...validBackup(), schemaVersion: 99 }));
    expect(r.ok === false && r.error).toMatch(/Unsupported backup version/);
  });
  it('rejects malformed records with a location', () => {
    const b = validBackup();
    (b.data.documents[0] as unknown as { currency: string }).currency = 'rupees';
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok === false && r.error).toMatch(/documents\.0\.currency/);
  });
  it('rejects unsafe embedded images (e.g. SVG markup)', () => {
    const b = validBackup();
    (b.data.company as unknown as { logo: unknown }).logo = { dataUrl: 'data:image/svg+xml,<svg onload=alert(1)>', width: 1, height: 1 };
    expect(parseBackup(JSON.stringify(b)).ok).toBe(false);
  });
});
