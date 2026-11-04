import dotenv from 'dotenv';
dotenv.config();

import { env } from '@/config/env.config';
import { createConfiguredEmailAdapter } from '@/modules/notifications/adapters/email.adapter';

async function main() {
  const args = process.argv.slice(2);
  const cliEmail = args.find(a => a.includes('@')) || (args[0] === '--email' ? args[1] : undefined);
  const targetEmail = cliEmail || env.NOTIFY_TEST_EMAIL;

  console.info('====================================================');
  console.info('       DIANO NOTIFICATION SYSTEM DIAGNOSTICS        ');
  console.info('====================================================');
  console.info(`Configured Email Provider: ${env.NOTIFICATION_EMAIL_PROVIDER}`);
  console.info(`From Address:              ${env.EMAIL_FROM}`);

  if (!targetEmail) {
    console.error('\n[ERROR] No test recipient specified!');
    console.info('Usage:');
    console.info('  npm run notify:check test@example.com');
    console.info('  OR set NOTIFY_TEST_EMAIL=test@example.com in .env\n');
    process.exit(1);
  }

  console.info(`Target Recipient:          ${targetEmail}`);
  console.info('\nDispatching diagnostic email...');

  const adapter = createConfiguredEmailAdapter();
  const testSubject = `[Diano Diagnostics] Test Email (${new Date().toISOString()})`;
  const testHtml = `
    <h2>Diano Notification System Diagnostic</h2>
    <p>This is a test notification confirming that email delivery is operational.</p>
    <ul>
      <li><strong>Provider:</strong> ${env.NOTIFICATION_EMAIL_PROVIDER}</li>
      <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
      <li><strong>Node Environment:</strong> ${env.NODE_ENV}</li>
    </ul>
    <p>If you received this message, your outbound email transport is correctly configured.</p>
  `;

  const startTime = Date.now();
  const result = await adapter.send({
    to: targetEmail,
    subject: testSubject,
    html: testHtml,
    text: `Diano Test Email - Provider: ${env.NOTIFICATION_EMAIL_PROVIDER} - Timestamp: ${new Date().toISOString()}`,
  });
  const durationMs = Date.now() - startTime;

  if (result.success) {
    console.info(`\n✔ SUCCESS! Email dispatched in ${durationMs}ms`);
    if (result.messageId) {
      console.info(`Message ID: ${result.messageId}`);
    }
    console.info('====================================================\n');
    process.exit(0);
  } else {
    console.error(`\n✖ FAILED after ${durationMs}ms:`);
    console.error(`Error: ${result.error || 'Unknown dispatch failure'}`);
    console.info('\nConfiguration Checklist:');
    if (env.NOTIFICATION_EMAIL_PROVIDER === 'smtp') {
      console.info('  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS must be set in .env');
    } else if (env.NOTIFICATION_EMAIL_PROVIDER === 'resend') {
      console.info('  - RESEND_API_KEY must be set in .env');
    } else if (env.NOTIFICATION_EMAIL_PROVIDER === 'brevo') {
      console.info('  - BREVO_API_KEY must be set in .env');
    }
    console.info('====================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});

