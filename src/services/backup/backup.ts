// Backup export / restore against local storage.

import { SCHEMA_VERSION } from '../domain';
import { db, getCompany, getSettings, guard, updateSettings } from '../storage/db';
import { BACKUP_APP_ID, type BackupFile } from './schema';
import { downloadBlob, nowIso, todayStr } from '../../utils/misc';

export async function buildBackup(): Promise<BackupFile> {
  const companyRow = await db.meta.get('company');
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    data: {
      company: companyRow ? await getCompany() : null,
      settings: await getSettings(),
      clients: await db.clients.toArray(),
      services: await db.services.toArray(),
      documents: await db.documents.toArray(),
      payments: await db.payments.toArray(),
      recurrences: await db.recurrences.toArray(),
    },
  };
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `invoice-studio-backup-${todayStr()}.json`);
  await updateSettings((s) => {
    s.lastBackupAt = nowIso();
  });
}

export type RestoreMode = 'replace' | 'merge-skip' | 'merge-overwrite';

/**
 * replace          — wipe local data, then load the backup.
 * merge-skip       — add records whose IDs don't exist locally; keep local versions on ID conflicts.
 * merge-overwrite  — add new records; backup versions replace local ones on ID conflicts.
 * Company profile/settings are replaced only in 'replace' mode, or when none exist locally.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<{ added: number; skipped: number }> {
  const d = backup.data;
  let added = 0;
  let skipped = 0;
  await guard(() =>
    db.transaction('rw', [db.meta, db.clients, db.services, db.documents, db.payments, db.recurrences], async () => {
      const tables = [
        [db.clients, d.clients],
        [db.services, d.services],
        [db.documents, d.documents],
        [db.payments, d.payments],
        [db.recurrences, d.recurrences],
      ] as const;
      if (mode === 'replace') {
        await db.meta.clear();
        for (const [table] of tables) await table.clear();
      }
      const hasCompany = !!(await db.meta.get('company'));
      if (d.company && (mode === 'replace' || !hasCompany)) await db.meta.put({ key: 'company', value: d.company });
      const hasSettings = !!(await db.meta.get('settings'));
      if (d.settings && (mode === 'replace' || !hasSettings)) await db.meta.put({ key: 'settings', value: d.settings });
      for (const [table, rows] of tables) {
        for (const row of rows as { id: string }[]) {
          const t = table as any;
          if (mode === 'merge-skip' && (await t.get(row.id))) {
            skipped++;
            continue;
          }
          await t.put(row);
          added++;
        }
      }
    }),
  );
  return { added, skipped };
}
