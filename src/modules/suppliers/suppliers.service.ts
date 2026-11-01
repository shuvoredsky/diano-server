import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService, recordAuditSafe } from '@/services/audit.service';
import { ensureFound } from '@/utils/entity.util';
import { suppliersRepository } from './suppliers.repository';
import type {
  ISuppliersRepository,
  SupplierEntity,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierFilterQuery,
} from './suppliers.types';
import crypto from 'crypto';

export class SuppliersService {
  constructor(
    private readonly repo: ISuppliersRepository = suppliersRepository,
    private readonly auditSvc: IAuditService = auditService,
  ) {}

  async listSuppliers(filter: SupplierFilterQuery): Promise<{ items: SupplierEntity[]; total: number }> {
    return this.repo.listSuppliers(filter);
  }

  async getSupplierById(id: string): Promise<SupplierEntity> {
    const supplier = await this.repo.findSupplierById(id);
    return ensureFound(supplier, 'Supplier', id);
  }

  async createSupplier(
    dto: CreateSupplierDto,
    actor?: { userId: string; email?: string },
  ): Promise<SupplierEntity> {
    const existingName = await this.repo.findSupplierByName(dto.name);
    if (existingName) {
      throw AppError.conflict(`Supplier with name '${dto.name}' already exists`);
    }

    if (dto.phone) {
      const existingPhone = await this.repo.findSupplierByPhone(dto.phone);
      if (existingPhone) {
        throw AppError.conflict(`Supplier with phone number '${dto.phone}' already exists`);
      }
    }

    let code = dto.code?.trim().toUpperCase();
    if (!code) {
      code = `SUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    const existingCode = await this.repo.findSupplierByCode(code);
    if (existingCode) {
      code = `SUP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }

    const supplier = await this.repo.createSupplier({
      ...dto,
      code,
    });

    await recordAuditSafe(this.auditSvc, actor, 'SUPPLIER_CREATED', 'SUPPLIER', supplier.id, {
      supplierName: supplier.name,
      supplierCode: supplier.code,
    });

    return supplier;
  }

  async updateSupplier(
    id: string,
    dto: UpdateSupplierDto,
    actor?: { userId: string; email?: string },
  ): Promise<SupplierEntity> {
    const supplier = await this.getSupplierById(id);

    if (dto.name && dto.name.toLowerCase() !== supplier.name.toLowerCase()) {
      const existingName = await this.repo.findSupplierByName(dto.name, id);
      if (existingName) {
        throw AppError.conflict(`Supplier with name '${dto.name}' already exists`);
      }
    }

    if (dto.phone && dto.phone !== supplier.phone) {
      const existingPhone = await this.repo.findSupplierByPhone(dto.phone, id);
      if (existingPhone) {
        throw AppError.conflict(`Supplier with phone number '${dto.phone}' already exists`);
      }
    }

    const updated = await this.repo.updateSupplier(id, dto);

    await recordAuditSafe(this.auditSvc, actor, 'SUPPLIER_UPDATED', 'SUPPLIER', id, {
      changes: dto,
    });

    return updated;
  }

  async deleteSupplier(
    id: string,
    actor?: { userId: string; email?: string },
  ): Promise<SupplierEntity> {
    const supplier = await this.getSupplierById(id);

    const deleted = await this.repo.softDeleteSupplier(id);

    await recordAuditSafe(this.auditSvc, actor, 'SUPPLIER_DELETED', 'SUPPLIER', id, {
      supplierName: supplier.name,
      supplierCode: supplier.code,
    });

    return deleted;
  }
}

export const suppliersService = new SuppliersService();
