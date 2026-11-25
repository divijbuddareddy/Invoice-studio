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

  it('imports legacy backups missing personalBank and bankAccount and preserves new fields', () => {
    const legacy = validBackup();
    delete (legacy.data.company as unknown as Record<string, unknown>).personalBank;
    delete (legacy.data.company as unknown as Record<string, unknown>).personalUpiId;
    delete (legacy.data.documents[0] as unknown as Record<string, unknown>).bankAccount;
    const legacyRes = parseBackup(JSON.stringify(legacy));
    expect(legacyRes.ok).toBe(true);
    if (legacyRes.ok) {
      expect(legacyRes.backup.data.company?.personalBank.bankName).toBe('');
      expect(legacyRes.backup.data.company?.personalUpiId).toBe('');
    }

    const updated = validBackup();
    updated.data.company.personalBank.bankName = 'ICICI';
    updated.data.company.personalUpiId = 'me@icici';
    updated.data.documents[0].bankAccount = 'personal';
    updated.data.documents[0].billingFrequency = 'monthly';
    updated.data.documents[0].billingStartDate = '2026-11-01';
    updated.data.documents[0].billingEndDate = '2027-11-01';
    updated.data.settings.readNotificationIds = ['doc1:2026-12-01'];
    const updatedRes = parseBackup(JSON.stringify(updated));
    expect(updatedRes.ok).toBe(true);
    if (updatedRes.ok) {
      expect(updatedRes.backup.data.company?.personalBank.bankName).toBe('ICICI');
      expect(updatedRes.backup.data.company?.personalUpiId).toBe('me@icici');
      expect(updatedRes.backup.data.documents[0].bankAccount).toBe('personal');
      expect(updatedRes.backup.data.documents[0].billingFrequency).toBe('monthly');
      expect(updatedRes.backup.data.documents[0].billingStartDate).toBe('2026-11-01');
      expect(updatedRes.backup.data.documents[0].billingEndDate).toBe('2027-11-01');
      expect(updatedRes.backup.data.settings?.readNotificationIds).toEqual(['doc1:2026-12-01']);
    }
  });
});
