import { diffSummary, logged, registerRestorer } from '../db/activity';
import { ServiceError } from './groups';

export { ServiceError };

export interface SettingsResult {
  my_name: string;
  my_upi_vpa: string;
}

export interface UpdateSettingsInput {
  my_name?: string;
  my_upi_vpa?: string;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

interface PersonRow {
  id: string;
  name: string;
  upi_vpa: string | null;
}

export const UPI_VPA_REGEX = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

// Register setting restorer
registerRestorer('setting', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .bind(snapshot.key, snapshot.value, snapshot.updated_at || nowIso),
  ];

  if (snapshot.key === 'my_name') {
    stmts.push(db.prepare('UPDATE people SET name = ? WHERE id = ?').bind(snapshot.value, 'me'));
  } else if (snapshot.key === 'my_upi_vpa') {
    stmts.push(db.prepare('UPDATE people SET upi_vpa = ? WHERE id = ?').bind(snapshot.value, 'me'));
  }

  return stmts;
});

export async function getSettings(db: D1Database): Promise<SettingsResult> {
  const { results: rows } = await db
    .prepare("SELECT key, value, updated_at FROM settings WHERE key IN ('my_name', 'my_upi_vpa')")
    .all<SettingRow>();

  const mePerson = await db
    .prepare("SELECT id, name, upi_vpa FROM people WHERE id = 'me'")
    .first<PersonRow>();

  const settingsMap = new Map<string, string>();
  for (const r of rows || []) {
    settingsMap.set(r.key, r.value);
  }

  const defaultName = mePerson?.name?.trim() ? mePerson.name.trim() : 'Me';
  const defaultUpi = mePerson?.upi_vpa?.trim() ? mePerson.upi_vpa.trim() : '';

  return {
    my_name: settingsMap.get('my_name') ?? defaultName,
    my_upi_vpa: settingsMap.get('my_upi_vpa') ?? defaultUpi,
  };
}

export async function updateSettings(
  db: D1Database,
  input: UpdateSettingsInput
): Promise<SettingsResult & { activity_ids: string[] }> {
  let updatedName: string | undefined = undefined;
  let updatedUpi: string | undefined = undefined;

  if (input.my_name !== undefined) {
    const trimmed = String(input.my_name).trim();
    if (!trimmed) {
      throw new ServiceError('Name cannot be empty', 400);
    }
    updatedName = trimmed;
  }

  if (input.my_upi_vpa !== undefined) {
    const trimmed = String(input.my_upi_vpa).trim();
    if (trimmed.length > 0) {
      if (!UPI_VPA_REGEX.test(trimmed)) {
        throw new ServiceError('Invalid UPI ID format', 400);
      }
    }
    updatedUpi = trimmed;
  }

  if (updatedName === undefined && updatedUpi === undefined) {
    const current = await getSettings(db);
    return { ...current, activity_ids: [] };
  }

  const { results: existingRows } = await db
    .prepare("SELECT key, value, updated_at FROM settings WHERE key IN ('my_name', 'my_upi_vpa')")
    .all<SettingRow>();

  const existingMap = new Map<string, SettingRow>();
  for (const r of existingRows || []) {
    existingMap.set(r.key, r);
  }

  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const activityEntries: any[] = [];

  if (updatedName !== undefined) {
    const existing = existingMap.get('my_name');
    const afterRow: SettingRow = {
      key: 'my_name',
      value: updatedName,
      updated_at: nowIso,
    };

    stmts.push(
      db
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`
        )
        .bind('my_name', updatedName, nowIso)
    );

    stmts.push(db.prepare('UPDATE people SET name = ? WHERE id = ?').bind(updatedName, 'me'));

    const summary = diffSummary('my_name', existing, afterRow, ['value']);
    activityEntries.push({
      entity_type: 'setting',
      entity_id: 'my_name',
      group_id: null,
      action: existing ? 'update' : 'create',
      summary: summary === 'my_name: no changes' ? `Updated my_name to ${updatedName}` : summary,
      before: existing ?? null,
      after: afterRow,
    });
  }

  if (updatedUpi !== undefined) {
    const existing = existingMap.get('my_upi_vpa');
    const afterRow: SettingRow = {
      key: 'my_upi_vpa',
      value: updatedUpi,
      updated_at: nowIso,
    };

    stmts.push(
      db
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`
        )
        .bind('my_upi_vpa', updatedUpi, nowIso)
    );

    stmts.push(
      db
        .prepare('UPDATE people SET upi_vpa = ? WHERE id = ?')
        .bind(updatedUpi.length > 0 ? updatedUpi : null, 'me')
    );

    const summary = diffSummary('my_upi_vpa', existing, afterRow, ['value']);
    activityEntries.push({
      entity_type: 'setting',
      entity_id: 'my_upi_vpa',
      group_id: null,
      action: existing ? 'update' : 'create',
      summary: summary === 'my_upi_vpa: no changes' ? `Updated my_upi_vpa to ${updatedUpi}` : summary,
      before: existing ?? null,
      after: afterRow,
    });
  }

  let activityId = '';
  if (stmts.length > 0) {
    activityId = await logged(db, stmts, activityEntries);
  }

  const finalSettings = await getSettings(db);
  return {
    ...finalSettings,
    activity_ids: activityEntries.length > 0 ? [activityId] : [],
  };
}
