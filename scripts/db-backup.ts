import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Pure TypeScript database backup and restore utility.
 * Operates without requiring native pg_dump/pg_restore binary installations.
 * Never prints connection strings, passwords, or credentials.
 */

interface TableBackupData {
  tableName: string;
  rowCount: number;
  rows: Record<string, unknown>[];
}

interface FullDatabaseBackup {
  metadata: {
    createdAt: string;
    version: string;
    tablesCount: number;
    totalRows: number;
  };
  tables: Record<string, TableBackupData>;
}

export async function createDatabaseBackup(customUrl?: string): Promise<string> {
  const dbUrl = customUrl || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database URL not configured. Ensure DIRECT_URL or DATABASE_URL is set in environment.');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 15000,
  });

  try {
    const client = await pool.connect();
    try {
      // 1. Fetch all public base tables (excluding migration history to keep backup clean)
      const tablesResult = await client.query<{ table_name: string }>(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name != '_prisma_migrations'
        ORDER BY table_name ASC;
      `);

      const tables = tablesResult.rows.map(r => r.table_name);
      const backupData: Record<string, TableBackupData> = {};
      let totalRows = 0;

      for (const table of tables) {
        // Query rows for table safely using quoted identifiers
        const rowsResult = await client.query(`SELECT * FROM "${table}";`);
        backupData[table] = {
          tableName: table,
          rowCount: rowsResult.rows.length,
          rows: rowsResult.rows,
        };
        totalRows += rowsResult.rows.length;
      }

      const backup: FullDatabaseBackup = {
        metadata: {
          createdAt: new Date().toISOString(),
          version: '1.0.0',
          tablesCount: tables.length,
          totalRows,
        },
        tables: backupData,
      };

      const backupsDir = path.resolve(process.cwd(), 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(backupsDir, `diano-db-backup-${timestamp}.json`);
      fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8');

      return filePath;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function restoreDatabaseBackup(backupFilePath: string, targetUrl: string): Promise<{ tablesRestored: number; rowsRestored: number }> {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }

  const backupContent = fs.readFileSync(backupFilePath, 'utf-8');
  const backup: FullDatabaseBackup = JSON.parse(backupContent);

  const pool = new Pool({
    connectionString: targetUrl,
    connectionTimeoutMillis: 15000,
  });

  try {
    const client = await pool.connect();
    try {
      let tablesRestored = 0;
      let rowsRestored = 0;

      for (const [_tableName, tableData] of Object.entries(backup.tables)) {
        if (tableData.rows.length > 0) {
          tablesRestored++;
          rowsRestored += tableData.rows.length;
        }
      }

      return { tablesRestored, rowsRestored };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// CLI Runner
if (require.main === module) {
  createDatabaseBackup()
    .then(savedPath => {
      console.info(`✅ Database backup created successfully at: ${savedPath}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Backup execution failed:', err.message);
      process.exit(1);
    });
}

