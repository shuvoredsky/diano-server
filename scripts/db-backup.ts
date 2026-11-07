import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Locate pg_dump binary on current system.
 */
export function findPgDumpPath(): string | null {
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
    return process.env.PG_DUMP_PATH;
  }

  const standardWindowsPaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
  ];

  for (const winPath of standardWindowsPaths) {
    if (fs.existsSync(winPath)) {
      return winPath;
    }
  }

  // Check if pg_dump is available in system PATH
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? 'where' : 'which';
    const result = execFileSync(checkCmd, ['pg_dump'], { stdio: 'pipe', encoding: 'utf-8' });
    const firstLine = result.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // Not found in PATH
  }

  return null;
}

export interface BackupOptions {
  customUrl?: string;
  outputDir?: string;
}

export interface BackupResult {
  filePath: string;
  fileSizeBytes: number;
  durationMs: number;
}

/**
 * Creates a real PostgreSQL custom-format (-Fc) dump using native pg_dump.
 * Never prints connection strings or credentials.
 */
export async function createRealDatabaseBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const pgDumpBinary = findPgDumpPath();
  if (!pgDumpBinary) {
    throw new Error(
      'pg_dump binary not found on this system.\n' +
      'Please install PostgreSQL (https://www.postgresql.org/download/) or set PG_DUMP_PATH in your environment.'
    );
  }

  const dbUrl = options.customUrl || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database URL not configured. Ensure DIRECT_URL or DATABASE_URL is set in environment.');
  }

  const backupsDir = options.outputDir || path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `diano-db-backup-${timestamp}.dump`;
  const outputPath = path.join(backupsDir, filename);

  const startTime = Date.now();

  try {
    // Run pg_dump with custom archive format (-Fc)
    // Redact credentials by passing args directly to execFileSync without shell interpolation
    execFileSync(
      pgDumpBinary,
      [
        '--format=c',
        '--no-owner',
        '--no-privileges',
        `--dbname=${dbUrl}`,
        `--file=${outputPath}`,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Sanitize any potential URL/credential leaks in error messages
    const sanitizedMsg = errorMsg.replace(/postgres(ql)?:\/\/[^@\s]+@[^\s/]+/gi, 'postgres://***:***@***');
    throw new Error(`pg_dump execution failed: ${sanitizedMsg}`, { cause: err });
  }

  const durationMs = Date.now() - startTime;
  const stats = fs.statSync(outputPath);

  return {
    filePath: outputPath,
    fileSizeBytes: stats.size,
    durationMs,
  };
}

if (require.main === module) {
  createRealDatabaseBackup()
    .then(result => {
      const sizeMb = (result.fileSizeBytes / (1024 * 1024)).toFixed(2);
      console.info('================ DATABASE BACKUP COMPLETED ================');
      console.info(`✅ Backup format: PostgreSQL Custom Archive (-Fc)`);
      console.info(`✅ Destination  : ${result.filePath}`);
      console.info(`✅ File Size    : ${result.fileSizeBytes} bytes (${sizeMb} MB)`);
      console.info(`✅ Duration     : ${result.durationMs}ms`);
      console.info('🔒 Credentials redacted: Zero database URLs or passwords leaked.');
      console.info('===========================================================');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Database backup failed:');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
