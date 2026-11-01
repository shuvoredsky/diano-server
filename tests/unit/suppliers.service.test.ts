import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import type { ISuppliersRepository, SupplierEntity } from '@/modules/suppliers/suppliers.types';
import type { IAuditService } from '@/services/audit.service';
import { AppError } from '@/utils/app-error';

describe('SuppliersService (Unit Tests with Mocked Repository)', () => {
  let service: SuppliersService;
  let mockRepo: ISuppliersRepository;
  let mockAudit: IAuditService;

  const sampleSupplier: SupplierEntity = {
    id: 'sup-1',
    name: 'Apex Footwear Ltd',
    code: 'SUP-APEX',
    contactPerson: 'Rafiqul Islam',
    email: 'rafiq@apex.com',
    phone: '01711223344',
    address: 'Gazipur, Dhaka',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { purchaseOrders: 3 },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      listSuppliers: vi.fn().mockResolvedValue({ items: [sampleSupplier], total: 1 }),
      findSupplierById: vi.fn().mockResolvedValue(sampleSupplier),
      findSupplierByCode: vi.fn().mockResolvedValue(null),
      findSupplierByName: vi.fn().mockResolvedValue(null),
      findSupplierByPhone: vi.fn().mockResolvedValue(null),
      createSupplier: vi.fn().mockImplementation(async data => ({
        ...sampleSupplier,
        ...data,
      })),
      updateSupplier: vi.fn().mockImplementation(async (id, data) => ({
        ...sampleSupplier,
        id,
        ...data,
      })),
      softDeleteSupplier: vi.fn().mockImplementation(async id => ({
        ...sampleSupplier,
        id,
        deletedAt: new Date(),
        isActive: false,
      })),
    };

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;

    service = new SuppliersService(mockRepo, mockAudit);
  });

  describe('createSupplier', () => {
    it('should create supplier successfully and record audit log', async () => {
      const result = await service.createSupplier(
        {
          name: 'Bata Bangladesh',
          phone: '01811223344',
          email: 'info@bata.com.bd',
        },
        { userId: 'admin-1', email: 'admin@diano.com' },
      );

      expect(result.name).toBe('Bata Bangladesh');
      expect(mockRepo.createSupplier).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPPLIER_CREATED',
          actorId: 'admin-1',
        }),
      );
    });

    it('should reject duplicate supplier name', async () => {
      vi.spyOn(mockRepo, 'findSupplierByName').mockResolvedValue(sampleSupplier);

      await expect(
        service.createSupplier({ name: 'Apex Footwear Ltd' }),
      ).rejects.toThrow(AppError);

      expect(mockRepo.createSupplier).not.toHaveBeenCalled();
    });

    it('should reject duplicate supplier phone', async () => {
      vi.spyOn(mockRepo, 'findSupplierByPhone').mockResolvedValue(sampleSupplier);

      await expect(
        service.createSupplier({ name: 'Unique Name', phone: '01711223344' }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('updateSupplier', () => {
    it('should update supplier details and log changes', async () => {
      const result = await service.updateSupplier(
        'sup-1',
        { contactPerson: 'Karim Rahman' },
        { userId: 'admin-1' },
      );

      expect(result.contactPerson).toBe('Karim Rahman');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPPLIER_UPDATED',
        }),
      );
    });

    it('should throw not found if supplier does not exist', async () => {
      vi.spyOn(mockRepo, 'findSupplierById').mockResolvedValue(null);

      await expect(
        service.updateSupplier('invalid-id', { name: 'New Name' }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('deleteSupplier', () => {
    it('should soft delete supplier and record audit log', async () => {
      const result = await service.deleteSupplier('sup-1', { userId: 'admin-1' });

      expect(result.deletedAt).toBeDefined();
      expect(result.isActive).toBe(false);
      expect(mockRepo.softDeleteSupplier).toHaveBeenCalledWith('sup-1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPPLIER_DELETED',
        }),
      );
    });
  });
});
