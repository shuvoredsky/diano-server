import dotenv from 'dotenv';
import path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    // Strip any possible password from connection string in error message
    return err.message.replace(/:[^:@]+@/, ':***@');
  }
  return String(err);
}

async function runCheck() {
  const dbUrl = process.env.DATABASE_URL;
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!dbUrl) {
    console.error('SAFETY ERROR: DATABASE_URL is not set in .env');
    process.exit(1);
  }

  if (!testDbUrl) {
    console.error('SAFETY ERROR: TEST_DATABASE_URL is not set in .env');
    process.exit(1);
  }

  let dbParsed: URL;
  let testDbParsed: URL;

  try {
    dbParsed = new URL(dbUrl);
  } catch {
    console.error('SAFETY ERROR: DATABASE_URL is not a valid URL format');
    process.exit(1);
  }

  try {
    testDbParsed = new URL(testDbUrl);
  } catch {
    console.error('SAFETY ERROR: TEST_DATABASE_URL is not a valid URL format');
    process.exit(1);
  }

  const primaryTarget = `${dbParsed.host}${dbParsed.pathname}`;
  const testTarget = `${testDbParsed.host}${testDbParsed.pathname}`;

  if (primaryTarget === testTarget) {
    console.error(
      'CRITICAL SAFETY REFUSAL: DATABASE_URL and TEST_DATABASE_URL target the exact same host and database! Stopping immediately to protect data.',
    );
    process.exit(1);
  }

  console.info('[Safety Check] DATABASE_URL and TEST_DATABASE_URL targets are distinct.');

  // Test 1: Primary Database Connectivity
  console.info('[1/2] Testing primary DATABASE_URL connectivity...');
  const primaryClient = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    await primaryClient.connect();
    await primaryClient.query('SELECT 1 AS ok');
    console.info('[1/2] Primary DATABASE_URL connected and executed SELECT 1 successfully.');
  } catch (err) {
    console.error('[1/2] Primary DATABASE_URL connection FAILED:', sanitizeError(err));
    await primaryClient.end().catch(() => {});
    process.exit(1);
  } finally {
    await primaryClient.end().catch(() => {});
  }

  // Test 2: Test Database Connectivity
  console.info('[2/2] Testing TEST_DATABASE_URL connectivity...');
  const testClient = new Client({
    connectionString: testDbUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    await testClient.connect();
    await testClient.query('SELECT 1 AS ok');
    console.info('[2/2] TEST_DATABASE_URL connected and executed SELECT 1 successfully.');
  } catch (err) {
    console.error('[2/2] TEST_DATABASE_URL connection FAILED:', sanitizeError(err));
    await testClient.end().catch(() => {});
    process.exit(1);
  } finally {
    await testClient.end().catch(() => {});
  }

  console.info('=== CONNECTIVITY AND SAFETY CHECK PASSED ===');
}

runCheck().catch(err => {
  console.error('Unexpected check failure:', sanitizeError(err));
  process.exit(1);
});
