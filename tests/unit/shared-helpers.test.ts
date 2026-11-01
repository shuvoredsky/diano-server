import { describe, it, expect } from 'vitest';
import { toNumberSafe, toMoneyString } from '@/utils/currency.util';
import { ensureFound } from '@/utils/entity.util';
import { AppError } from '@/utils/app-error';
import { recordAuditSafe, type IAuditService } from '@/services/audit.service';
import { vi } from 'vitest';

describe('Shared Helpers (Refactoring Audit Verification)', () => {
  describe('currency.util (toNumberSafe & toMoneyString)', () => {
    it('should safely convert various decimal representations to number', () => {
      expect(toNumberSafe(123.45)).toBe(123.45);
      expect(toNumberSafe('99.99')).toBe(99.99);
      expect(toNumberSafe(null)).toBe(0);
      expect(toNumberSafe(undefined, 10)).toBe(10);
      expect(toNumberSafe({ toNumber: () => 45.67 })).toBe(45.67);
      expect(toNumberSafe('invalid_number', 5)).toBe(5);
    });

    it('should format money safely to 2-decimal string', () => {
      expect(toMoneyString(100)).toBe('100.00');
      expect(toMoneyString(50.5)).toBe('50.50');
      expect(toMoneyString(null)).toBe('0.00');
      expect(toMoneyString({ toNumber: () => 12.345 })).toBe('12.35');
    });
  });

  describe('entity.util (ensureFound)', () => {
    it('should return the entity when present', () => {
      const user = { id: 'u1', name: 'Karim' };
      const result = ensureFound(user, 'User', 'u1');
      expect(result).toEqual(user);
    });

    it('should throw 404 AppError when entity is null or undefined', () => {
      expect(() => ensureFound(null, 'Product', 'p-123')).toThrow(AppError);
      expect(() => ensureFound(null, 'Product', 'p-123')).toThrow("Product with ID 'p-123' not found");
      expect(() => ensureFound(undefined, 'Cart')).toThrow('Cart not found');
    });
  });

  describe('audit.service (recordAuditSafe)', () => {
    it('should record audit when valid actor is present', async () => {
      const mockAuditSvc: IAuditService = {
        record: vi.fn().mockResolvedValue(undefined),
      };

      await recordAuditSafe(
        mockAuditSvc,
        { userId: 'admin-1', actorType: 'USER' },
        'SUPPLIER_CREATED',
        'SUPPLIER',
        'sup-1',
        { name: 'Apex' },
      );

      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          actorType: 'USER',
          action: 'SUPPLIER_CREATED',
          targetType: 'SUPPLIER',
          targetId: 'sup-1',
        }),
      );
    });

    it('should skip recording when no actor is provided', async () => {
      const mockAuditSvc: IAuditService = {
        record: vi.fn().mockResolvedValue(undefined),
      };

      await recordAuditSafe(
        mockAuditSvc,
        undefined,
        'ANY_ACTION',
        'ANY_TARGET',
      );

      expect(mockAuditSvc.record).not.toHaveBeenCalled();
    });
  });
});
