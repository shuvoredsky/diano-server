import { prisma } from '@/config/database';
import type {
  ISuppliersRepository,
  SupplierEntity,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierFilterQuery,
} from './suppliers.types';
import type { Prisma } from '@prisma/client';

export class SuppliersRepository implements ISuppliersRepository {
  async listSuppliers(filter: SupplierFilterQuery): Promise<{ items: SupplierEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { contactPerson: { contains: filter.search, mode: 'insensitive' } },
              { phone: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { purchaseOrders: true },
          },
        },
      }),
      prisma.supplier.count({ where }),
    ]);

    return {
      items: items as unknown as SupplierEntity[],
      total,
    };
  }

  async findSupplierById(id: string): Promise<SupplierEntity | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: { purchaseOrders: true },
        },
      },
    });

    return supplier as unknown as SupplierEntity | null;
  }

  async findSupplierByCode(code: string): Promise<SupplierEntity | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { code, deletedAt: null },
    });

    return supplier as unknown as SupplierEntity | null;
  }

  async findSupplierByName(name: string, excludeId?: string): Promise<SupplierEntity | null> {
    const supplier = await prisma.supplier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return supplier as unknown as SupplierEntity | null;
  }

  async findSupplierByPhone(phone: string, excludeId?: string): Promise<SupplierEntity | null> {
    const supplier = await prisma.supplier.findFirst({
      where: {
        phone,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return supplier as unknown as SupplierEntity | null;
  }

  async createSupplier(data: CreateSupplierDto & { code: string }): Promise<SupplierEntity> {
    const created = await prisma.supplier.create({
      data: {
        name: data.name,
        code: data.code,
        contactPerson: data.contactPerson ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        isActive: data.isActive ?? true,
      },
    });

    return created as unknown as SupplierEntity;
  }

  async updateSupplier(id: string, data: UpdateSupplierDto): Promise<SupplierEntity> {
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return updated as unknown as SupplierEntity;
  }

  async softDeleteSupplier(id: string): Promise<SupplierEntity> {
    const deleted = await prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return deleted as unknown as SupplierEntity;
  }
}

export const suppliersRepository = new SuppliersRepository();
