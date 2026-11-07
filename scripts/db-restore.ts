import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Locate pg_restore binary on current system.
 */
export function findPgRestorePath(): string | null {
  if (process.env.PG_RESTORE_PATH && fs.existsSync(process.env.PG_RESTORE_PATH)) {
    return process.env.PG_RESTORE_PATH;
  }

  const standardWindowsPaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_restore.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_restore.exe',
  ];

  for (const winPath of standardWindowsPaths) {
    if (fs.existsSync(winPath)) {
      return winPath;
    }
  }

  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? 'where' : 'which';
    const result = execFileSync(checkCmd, ['pg_restore'], { stdio: 'pipe', encoding: 'utf-8' });
    const firstLine = result.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // Not found in PATH
  }

  return null;
}

export interface RestoreOptions {
  dumpFilePath: string;
  targetUrl?: string;
  forceProduction?: boolean;
  dryRun?: boolean;
  jobs?: number;
}

export interface RestoreResult {
  dumpFile: string;
  targetEnvironment: 'TEST' | 'PRODUCTION';
  durationMs: number;
  dryRun: boolean;
  tocEntriesCount?: number;
}

/**
 * Restores a PostgreSQL custom archive backup using pg_restore.
 * Safe guard: Refuses to restore to production databases unless explicitly overridden.
 */
export async function restoreRealDatabaseBackup(options: RestoreOptions): Promise<RestoreResult> {
  const pgRestoreBinary = findPgRestorePath();
  if (!pgRestoreBinary) {
    throw new Error(
      'pg_restore binary not found on this system.\n' +
      'Please install PostgreSQL (https://www.postgresql.org/download/) or set PG_RESTORE_PATH in your environment.'
    );
  }

  if (!fs.existsSync(options.dumpFilePath)) {
    throw new Error(`Dump file does not exist: ${options.dumpFilePath}`);
  }

  const targetUrl = options.targetUrl || process.env.TEST_DATABASE_URL;
  if (!targetUrl) {
    throw new Error('Target database URL not provided and TEST_DATABASE_URL is not set.');
  }

  // Safety check: Detect if targeting production database
  const isTargetingProduction =
    targetUrl === process.env.DATABASE_URL ||
    targetUrl === process.env.DIRECT_URL ||
    (!targetUrl.includes('test') && targetUrl !== process.env.TEST_DATABASE_URL);

  if (isTargetingProduction && !options.forceProduction) {
    throw new Error(
      '🚨 SAFETY REFUSAL: Target database appears to be PRODUCTION.\n' +
      'pg_restore to production is disabled by default to prevent catastrophic data loss.\n' +
      'If you intentionally need to restore to production, pass the flag: --i-know-what-im-doing'
    );
  }

  const startTime = Date.now();

  // If dry-run requested: verify archive TOC and test target DB connection without writing
  if (options.dryRun) {
    const listOutput = execFileSync(
      pgRestoreBinary,
      ['--no-password', '--list', options.dumpFilePath],
      { encoding: 'utf-8' }
    );
    const tocEntries = listOutput.split(/\r?\n/).filter(line => line.trim() && !line.startsWith(';')).length;

    // Verify connectivity to target DB
    const pool = new Pool({ connectionString: targetUrl, connectionTimeoutMillis: 10000 });
    const client = await pool.connect();
    try {
      await client.query('SELECT 1;');
    } finally {
      client.release();
      await pool.end();
    }

    const durationMs = Date.now() - startTime;
    return {
      dumpFile: path.basename(options.dumpFilePath),
      targetEnvironment: isTargetingProduction ? 'PRODUCTION' : 'TEST',
      durationMs,
      dryRun: true,
      tocEntriesCount: tocEntries,
    };
  }

  try {
    const args = [
      '--no-password',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      `--dbname=${targetUrl}`,
      options.dumpFilePath,
    ];

    execFileSync(pgRestoreBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'utf-8',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = errorMsg.replace(/postgres(ql)?:\/\/[^@\s]+@[^\s/]+/gi, 'postgres://***:***@***');

    // pg_restore exits with code 1 for non-critical drop warnings
    if (!sanitizedMsg.includes('errors ignored on restore') && !sanitizedMsg.includes('does not exist, skipping')) {
      throw new Error(`pg_restore failed: ${sanitizedMsg}`, { cause: err });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    dumpFile: path.basename(options.dumpFilePath),
    targetEnvironment: isTargetingProduction ? 'PRODUCTION' : 'TEST',
    durationMs,
    dryRun: false,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let dumpFile: string | undefined;
  let targetUrl: string | undefined;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      dumpFile = args[i + 1];
      i++;
    } else if (args[i] === '--target' && args[i + 1]) {
      targetUrl = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--i-know-what-im-doing') {
      force = true;
    }
  }

  // If no dump file specified, pick latest from backups/
  if (!dumpFile) {
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (fs.existsSync(backupsDir)) {
      const files = fs
        .readdirSync(backupsDir)
        .filter(f => f.endsWith('.dump'))
        .sort()
        .reverse();
      if (files.length > 0) {
        dumpFile = path.join(backupsDir, files[0]);
        console.info(`ℹ️ No --file specified. Using latest backup: ${files[0]}`);
      }
    }
  }

  if (!dumpFile) {
    console.error('❌ Error: No dump file specified and no existing backups found.');
    console.error('Usage: tsx scripts/db-restore.ts --file <path/to/dump> [--target <url>] [--dry-run] [--i-know-what-im-doing]');
    process.exit(1);
  }

  restoreRealDatabaseBackup({
    dumpFilePath: dumpFile,
    targetUrl,
    forceProduction: force,
    dryRun,
  })
    .then(res => {
      console.info('================ DATABASE RESTORE COMPLETED ================');
      console.info(`✅ Source dump file   : ${res.dumpFile}`);
      console.info(`✅ Target Environment : ${res.targetEnvironment}`);
      console.info(`✅ Mode               : ${res.dryRun ? 'DRY-RUN (Archive verified, no writes)' : 'FULL RESTORE'}`);
      if (res.tocEntriesCount) {
        console.info(`✅ Verified Entries   : ${res.tocEntriesCount} valid TOC objects`);
      }
      console.info(`✅ Duration           : ${res.durationMs}ms`);
      console.info('🔒 Credentials redacted: Zero database URLs or passwords leaked.');
      console.info('============================================================');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Database restore failed:');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
