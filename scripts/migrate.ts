import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[Migrate] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(appDir, 'dist/src/db/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[Migrate] Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`[Migrate] Running ${file}...`);
    await pool.query(sql);
    console.log(`[Migrate] Completed ${file}`);
  }

  console.log('[Migrate] All migrations complete');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('[Migrate] Failed:', err);
  process.exit(1);
});
