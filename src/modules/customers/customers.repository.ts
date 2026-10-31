import { prisma } from '@/config/database';
import type { AddressType, Prisma } from '@prisma/client';
import type {
  ICustomersRepository,
  CustomerFilterOptions,
  CustomerAddressDto,
  CreateAddressInput,
  UpdateAddressInput,
  ConsentPreferenceItem,
  CustomerNoteItem,
  CustomerTimelineItem,
  CustomerOrderSummary,
  CustomerRecord,
  CustomerWithDetails,
  ConsentRecordItem,
} from './customers.types';

export class PrismaCustomersRepository implements ICustomersRepository {
  async findCustomers(filter: CustomerFilterOptions): Promise<{ items: CustomerRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      roles: {
        some: {
          role: {
            slug: 'customer',
          },
        },
      },
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
              { phone: { contains: filter.search } },
            ],
          }
        : {}),
    };

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'desc';

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: filter.skip,
        take: filter.take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          profile: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findCustomerById(id: string): Promise<CustomerWithDetails | null> {
    return prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        roles: {
          some: {
            role: {
              slug: 'customer',
            },
          },
        },
      },
      include: {
        profile: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    }) as unknown as Promise<CustomerWithDetails | null>;
  }

  async updateCustomerProfile(
    userId: string,
    data: { name?: string; phone?: string; avatarUrl?: string; gender?: string; dateOfBirth?: Date },
  ): Promise<CustomerRecord | null> {
    return prisma.$transaction(async tx => {
      if (data.name !== undefined || data.phone !== undefined || data.avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            name: data.name,
            phone: data.phone,
            avatarUrl: data.avatarUrl,
          },
        });
      }

      if (data.gender !== undefined || data.dateOfBirth !== undefined) {
        await tx.customerProfile.upsert({
          where: { userId },
          update: {
            gender: data.gender,
            dateOfBirth: data.dateOfBirth,
          },
          create: {
            userId,
            gender: data.gender,
            dateOfBirth: data.dateOfBirth,
          },
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }) as unknown as Promise<CustomerRecord | null>;
    });
  }

  async findAddresses(userId: string): Promise<CustomerAddressDto[]> {
    return prisma.customerAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findAddressById(addressId: string): Promise<CustomerAddressDto | null> {
    return prisma.customerAddress.findUnique({
      where: { id: addressId },
    });
  }

  async countAddresses(userId: string): Promise<number> {
    return prisma.customerAddress.count({
      where: { userId },
    });
  }

  async createAddress(userId: string, data: CreateAddressInput): Promise<CustomerAddressDto> {
    return prisma.customerAddress.create({
      data: {
        userId,
        type: data.type ?? 'SHIPPING',
        isDefault: data.isDefault ?? false,
        fullName: data.fullName,
        phone: data.phone,
        alternativePhone: data.alternativePhone,
        addressLine: data.addressLine,
        district: data.district,
        city: data.city,
        area: data.area,
        postalCode: data.postalCode,
        landmark: data.landmark,
      },
    });
  }

  async updateAddress(addressId: string, data: UpdateAddressInput): Promise<CustomerAddressDto> {
    return prisma.customerAddress.update({
      where: { id: addressId },
      data,
    });
  }

  async clearDefaultAddress(userId: string, type: AddressType): Promise<void> {
    await prisma.customerAddress.updateMany({
      where: { userId, type, isDefault: true },
      data: { isDefault: false },
    });
  }

  async deleteAddress(addressId: string): Promise<void> {
    await prisma.customerAddress.delete({
      where: { id: addressId },
    });
  }

  async findLatestConsents(userId: string): Promise<ConsentPreferenceItem[]> {
    const records = await prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const latestMap = new Map<string, ConsentPreferenceItem>();
    for (const r of records) {
      const key = `${r.channel}:${r.purpose}`;
      if (!latestMap.has(key)) {
        latestMap.set(key, {
          channel: r.channel,
          purpose: r.purpose as 'MARKETING' | 'RECOVERY' | 'ANALYTICS',
          isGranted: r.isGranted,
        });
      }
    }

    return Array.from(latestMap.values());
  }

  async recordConsent(
    userId: string,
    item: ConsentPreferenceItem,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    await prisma.consentRecord.create({
      data: {
        userId,
        channel: item.channel,
        purpose: item.purpose,
        isGranted: item.isGranted,
        grantedAt: item.isGranted ? new Date() : new Date(),
        revokedAt: item.isGranted ? null : new Date(),
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });
  }

  async findConsentHistory(userId: string): Promise<ConsentRecordItem[]> {
    return prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }) as unknown as Promise<ConsentRecordItem[]>;
  }

  async getCustomerNotes(customerId: string): Promise<CustomerNoteItem[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        targetType: 'CUSTOMER',
        targetId: customerId,
        action: 'CUSTOMER_NOTE_ADDED',
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map(l => {
      const meta = l.metadata as Record<string, unknown> | null;
      return {
        id: l.id,
        authorId: l.actorId,
        note: (meta?.note as string) ?? '',
        createdAt: l.createdAt,
      };
    });
  }

  async addCustomerNote(customerId: string, authorId: string, note: string): Promise<CustomerNoteItem> {
    const log = await prisma.auditLog.create({
      data: {
        actorId: authorId,
        actorType: 'USER',
        action: 'CUSTOMER_NOTE_ADDED',
        targetType: 'CUSTOMER',
        targetId: customerId,
        metadata: { note },
      },
    });

    return {
      id: log.id,
      authorId,
      note,
      createdAt: log.createdAt,
    };
  }

  async getCustomerTimeline(customerId: string): Promise<CustomerTimelineItem[]> {
    const [loginLogs, auditLogs] = await Promise.all([
      prisma.loginHistory.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.auditLog.findMany({
        where: {
          targetType: 'CUSTOMER',
          targetId: customerId,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const timeline: CustomerTimelineItem[] = [];

    for (const l of loginLogs) {
      timeline.push({
        id: `login_${l.id}`,
        type: 'LOGIN',
        title: `Login ${l.status}`,
        description: l.status === 'SUCCESS' ? 'Successful authentication' : (l.reason ?? 'Failed login attempt'),
        timestamp: l.createdAt,
        metadata: { ip: l.ip, device: l.device },
      });
    }

    for (const a of auditLogs) {
      const meta = a.metadata as Record<string, unknown> | null;
      timeline.push({
        id: `audit_${a.id}`,
        type: a.action === 'CUSTOMER_NOTE_ADDED' ? 'NOTE' : 'STATUS_CHANGE',
        title: a.action.replace(/_/g, ' '),
        description: (meta?.note as string) ?? null,
        timestamp: a.createdAt,
        metadata: meta ?? undefined,
      });
    }

    return timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getOrderSummary(_customerId: string): Promise<CustomerOrderSummary> {
    // Orders module is deferred to M6; return standard initial summary without mock/fake data
    return {
      totalOrders: 0,
      totalSpent: '0.00',
      cancelledOrders: 0,
      returnedOrders: 0,
    };
  }

  async anonymizeAndSoftDelete(userId: string): Promise<void> {
    const anonymizedEmail = `anonymized_${userId.slice(-8)}@deleted.diano.internal`;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          phone: null,
          name: 'Anonymized Customer',
          avatarUrl: null,
          status: 'INACTIVE',
          deletedAt: new Date(),
        },
      }),
      prisma.customerAddress.deleteMany({
        where: { userId },
      }),
      prisma.customerProfile.update({
        where: { userId },
        data: {
          notes: 'Account deleted and PII anonymized upon user request.',
        },
      }),
    ]);
  }
}

export const customersRepository: ICustomersRepository = new PrismaCustomersRepository();
