import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogsService } from '@/modules/audit-logs/audit-logs.service';
import type { IAuditLogsRepository, AuditLogRecordWithActor } from '@/modules/audit-logs/audit-logs.repository';
import { sanitizeAuditMetadata, maskAuditIp } from '@/services/audit.service';

describe('AuditLogsService & Metadata Redaction (Unit Tests)', () => {
  let service: AuditLogsService;
  let mockRepo: vi.Mocked<IAuditLogsRepository>;

  const createMockAuditLog = (
    overrides: Partial<AuditLogRecordWithActor> = {},
  ): AuditLogRecordWithActor => ({
    id: 'audit_1',
    actorId: 'user_1',
    actorType: 'USER',
    action: 'ORDER_STATUS_UPDATED',
    targetType: 'Order',
    targetId: 'order_1',
    requestId: 'req_123',
    ipAddress: '103.112.45.89',
    userAgent: 'Mozilla/5.0',
    metadata: {
      previousStatus: 'PENDING',
      newStatus: 'CONFIRMED',
      password: 'leaked_password',
      token: 'leaked_jwt_token',
      secret: 'leaked_secret',
      nested: {
        refreshToken: 'leaked_refresh',
        safeField: 'allowed_value',
      },
    },
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    actor: {
      id: 'user_1',
      name: 'Admin User',
      email: 'admin@diano.com.bd',
    },
    ...overrides,
  });

  beforeEach(() => {
    mockRepo = {
      findMany: vi.fn(),
      findById: vi.fn(),
    };
    service = new AuditLogsService(mockRepo);
  });

  it('recursively strips secret, token, password, and authorization keys from metadata', () => {
    const cleaned = sanitizeAuditMetadata({
      orderId: 'ord_1',
      password: '123',
      passwordHash: 'hash',
      accessToken: 'jwt',
      clientSecret: 'sec',
      authorization: 'Bearer xyz',
      nested: {
        token: 'abc',
        note: 'Safe note',
      },
    });

    expect(cleaned).toEqual({
      orderId: 'ord_1',
      nested: {
        note: 'Safe note',
      },
    });
  });

  it('masks IPv4 and IPv6 addresses for non-super-admin viewers and preserves full IP for super-admin', () => {
    expect(maskAuditIp('103.112.45.89', false)).toBe('103.112.45.***');
    expect(maskAuditIp('103.112.45.89', true)).toBe('103.112.45.89');
    expect(maskAuditIp('2001:db8:85a3::8a2e:370:7334', false)).toBe('2001:db8:****');
  });

  it('lists audit logs with Dhaka date range, masks IP for support/manager, and redacts sensitive metadata', async () => {
    mockRepo.findMany.mockResolvedValue({
      items: [createMockAuditLog()],
      total: 1,
    });

    const result = await service.listAuditLogs(
      {
        page: 1,
        limit: 20,
        actor: 'admin@diano.com.bd',
        action: 'ORDER_STATUS',
        targetType: 'Order',
        from: '2026-11-01',
        to: '2026-11-11',
        sortOrder: 'desc',
      },
      ['admin'],
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].ipAddress).toBe('103.112.45.***');
    expect(result.items[0].metadata).toEqual({
      previousStatus: 'PENDING',
      newStatus: 'CONFIRMED',
      nested: {
        safeField: 'allowed_value',
      },
    });
    expect(result.items[0].metadata).not.toHaveProperty('password');
    expect(result.items[0].metadata).not.toHaveProperty('token');
    expect(result.items[0].metadata).not.toHaveProperty('secret');
  });

  it('returns full IP address when viewer has super-admin role', async () => {
    mockRepo.findById.mockResolvedValue(createMockAuditLog());

    const item = await service.getAuditLogById('audit_1', ['super-admin']);
    expect(item.ipAddress).toBe('103.112.45.89');
  });

  it('throws 404 when audit log ID does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.getAuditLogById('missing_id', ['super-admin'])).rejects.toThrow(
      'Audit log entry not found',
    );
  });
});

