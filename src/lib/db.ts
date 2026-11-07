import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from '@/types/automation';
import { INITIAL_SEED_DATA } from '@/lib/seed-data';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'store.local.json');

export { INITIAL_SEED_DATA };

export function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE_PATH)) {
      fs.writeFileSync(
        DB_FILE_PATH,
        JSON.stringify(INITIAL_SEED_DATA, null, 2),
        'utf-8'
      );
      return structuredClone(INITIAL_SEED_DATA);
    }
    const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    return structuredClone(INITIAL_SEED_DATA);
  }
}

export function writeDb(data: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist local DB:', err);
  }
}

/**
 * 브라우저(클라이언트)로 DB 상태를 내려보낼 때 실제 accessToken 원문을 제거하여 노출 차단
 */
export function sanitizeDbForClient(db: DatabaseSchema): DatabaseSchema {
  return {
    ...db,
    accounts: db.accounts.map((acc) => {
      const copy = { ...acc };
      delete copy.accessToken;
      return copy;
    }),
  };
}

export function resetDbToSeed(): DatabaseSchema {
  const fresh = structuredClone(INITIAL_SEED_DATA);
  writeDb(fresh);
  return fresh;
}
