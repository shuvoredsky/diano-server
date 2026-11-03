export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportContext {
  userId: string;
  userRoles: string[];
  canViewFinance: boolean;
  canExportPii: boolean;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  format?: 'currency' | 'date' | 'number' | 'text';
  isFinancial?: boolean;
  isPii?: boolean;
}

/**
 * Prevents formula injection (CSV/Excel injection) by prefixing suspicious symbols with a single quote.
 */
export function sanitizeCellValue(val: unknown): unknown {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    if (/^[=+\-@\t]/.test(val) || /^[=+\-@\t]/.test(val.trimStart())) {
      return `'${val}`;
    }
  }
  return val;
}

/**
 * Masks phone numbers to protect customer PII unless explicit permission granted.
 * e.g., "01712345678" -> "017****5678"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length <= 6) return '****';
  return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
}

/**
 * Masks email address to protect customer PII unless explicit permission granted.
 * e.g., "customer@example.com" -> "c***r@example.com"
 */
export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '****';
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain) return '****';

  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
