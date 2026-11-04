export const INTERNAL_JOB_NAMES = [
  'classify-abandoned',
  'reconcile-payments',
  'cancel-expired-orders',
  'cleanup-guest-carts',
  'release-expired-reservations',
  'purge-checkout-pii',
  'process-notifications',
  'purge-old-notifications',
] as const;

export type InternalJobName = (typeof INTERNAL_JOB_NAMES)[number];

export interface JobExecutionResult {
  jobName: InternalJobName;
  status: 'SUCCESS' | 'SKIPPED_ALREADY_RUNNING' | 'FAILED';
  summary: Record<string, unknown>;
  durationMs: number;
  executedAt: string;
}
