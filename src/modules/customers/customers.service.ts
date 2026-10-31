import { AppError } from '@/utils/app-error';
import { getPagination, getPaginationMeta } from '@/utils/pagination';
import type {
  ICustomersRepository,
  CustomerQueryOptions,
  CustomerSummaryItem,
  CustomerAddressDto,
  CreateAddressInput,
  UpdateAddressInput,
  UpdateConsentsInput,
  ConsentPreferenceItem,
  CustomerNoteItem,
  CustomerTimelineItem,
  CustomerDetailAdminView,
  CustomerExportData,
} from './customers.types';
import { customersRepository as defaultRepo } from './customers.repository';
import type { IAuthRepository } from '@/modules/auth/auth.types';
import { authRepository as defaultAuthRepo } from '@/modules/auth/auth.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type { UserStatus } from '@prisma/client';

const MAX_ADDRESSES_PER_CUSTOMER = 10;

export class CustomersService {
  constructor(
    private readonly repo: ICustomersRepository = defaultRepo,
    private readonly authRepo: IAuthRepository = defaultAuthRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Customer Self-Service
  // ---------------------------------------------------------------------------

  async getProfile(userId: string) {
    const customer = await this.repo.findCustomerById(userId);
    if (!customer) {
      throw AppError.notFound('Customer profile not found');
    }

    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      status: customer.status,
      dateOfBirth: customer.profile?.dateOfBirth ?? null,
      gender: customer.profile?.gender ?? null,
      loyaltyPoints: customer.profile?.loyaltyPoints ?? 0,
      totalSpent: customer.profile?.totalSpent?.toString() ?? '0.00',
      ordersCount: customer.profile?.ordersCount ?? 0,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string; phone?: string; avatarUrl?: string; gender?: string; dateOfBirth?: Date },
  ) {
    if (data.phone) {
      const existing = await this.authRepo.findUserByPhone(data.phone);
      if (existing && existing.id !== userId) {
        throw AppError.conflict('An account with this phone number already exists');
      }
    }

    await this.repo.updateCustomerProfile(userId, data);
    return this.getProfile(userId);
  }

  async listAddresses(userId: string): Promise<CustomerAddressDto[]> {
    return this.repo.findAddresses(userId);
  }

  async addAddress(userId: string, input: CreateAddressInput): Promise<CustomerAddressDto> {
    const count = await this.repo.countAddresses(userId);
    if (count >= MAX_ADDRESSES_PER_CUSTOMER) {
      throw AppError.badRequest(
        `Safety policy: Maximum ${MAX_ADDRESSES_PER_CUSTOMER} addresses allowed per customer`,
      );
    }

    const addressType = input.type ?? 'SHIPPING';

    // If marked as default, clear any existing default address of this type
    if (input.isDefault) {
      await this.repo.clearDefaultAddress(userId, addressType);
    } else if (count === 0) {
      // If this is the very first address, automatically make it default
      input.isDefault = true;
    }

    return this.repo.createAddress(userId, input);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<CustomerAddressDto> {
    const address = await this.repo.findAddressById(addressId);
    if (!address) {
      throw AppError.notFound('Address not found');
    }

    // Ownership Verification: Customers cannot alter other customers' addresses
    if (address.userId !== userId) {
      throw AppError.forbidden('You do not have permission to modify this address');
    }

    const targetType = input.type ?? address.type;

    if (input.isDefault) {
      await this.repo.clearDefaultAddress(userId, targetType);
    }

    return this.repo.updateAddress(addressId, input);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.repo.findAddressById(addressId);
    if (!address) {
      throw AppError.notFound('Address not found');
    }

    // Ownership Verification
    if (address.userId !== userId) {
      throw AppError.forbidden('You do not have permission to delete this address');
    }

    await this.repo.deleteAddress(addressId);
  }

  async getConsents(userId: string): Promise<ConsentPreferenceItem[]> {
    return this.repo.findLatestConsents(userId);
  }

  async updateConsents(
    userId: string,
    input: UpdateConsentsInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<ConsentPreferenceItem[]> {
    for (const item of input.consents) {
      await this.repo.recordConsent(userId, item, meta);
    }

    await this.auditSvc.record({
      actorId: userId,
      actorType: 'USER',
      action: 'CUSTOMER_CONSENTS_UPDATED',
      targetType: 'CUSTOMER',
      targetId: userId,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      metadata: { consentUpdates: input.consents },
    });

    return this.repo.findLatestConsents(userId);
  }

  async exportData(userId: string): Promise<CustomerExportData> {
    const customer = await this.repo.findCustomerById(userId);
    if (!customer) {
      throw AppError.notFound('Customer profile not found');
    }

    const [addresses, consentHistory, loginHistory] = await Promise.all([
      this.repo.findAddresses(userId),
      this.repo.findConsentHistory(userId),
      this.authRepo.getLoginHistory(userId, 50),
    ]);

    return {
      profile: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        avatarUrl: customer.avatarUrl,
        dateOfBirth: customer.profile?.dateOfBirth ?? null,
        gender: customer.profile?.gender ?? null,
        createdAt: customer.createdAt,
      },
      addresses,
      consentRecords: consentHistory.map(c => ({
        channel: c.channel,
        purpose: c.purpose,
        isGranted: c.isGranted,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
      })),
      recentLogins: loginHistory.map(l => ({
        ip: l.ip,
        device: l.device,
        userAgent: l.userAgent,
        createdAt: l.createdAt,
      })),
    };
  }

  async deleteAccount(
    userId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const customer = await this.repo.findCustomerById(userId);
    if (!customer) {
      throw AppError.notFound('Customer profile not found');
    }

    // Soft delete with PII anonymization policy
    await this.repo.anonymizeAndSoftDelete(userId);

    // Invalidate all active sessions immediately
    await this.authRepo.revokeAllUserSessions(userId);

    await this.auditSvc.record({
      actorId: userId,
      actorType: 'USER',
      action: 'CUSTOMER_ACCOUNT_DELETED_ANONYMIZED',
      targetType: 'CUSTOMER',
      targetId: userId,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });
  }

  // ---------------------------------------------------------------------------
  // Admin Customer Management
  // ---------------------------------------------------------------------------

  async listCustomers(filter: CustomerQueryOptions) {
    const { page, limit, skip, take } = getPagination(filter);
    const { items, total } = await this.repo.findCustomers({ ...filter, page, limit, skip, take });

    const formatted: CustomerSummaryItem[] = items.map(c => ({
      id: c.id,
      email: c.email,
      name: c.name,
      phone: c.phone,
      avatarUrl: c.avatarUrl,
      status: c.status,
      loyaltyPoints: c.profile?.loyaltyPoints ?? 0,
      totalSpent: c.profile?.totalSpent?.toString() ?? '0.00',
      ordersCount: c.profile?.ordersCount ?? 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      items: formatted,
      meta: getPaginationMeta(total, page, limit),
    };
  }

  async getCustomerDetail(id: string): Promise<CustomerDetailAdminView> {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) {
      throw AppError.notFound('Customer not found');
    }

    const [addresses, consents, orderSummary] = await Promise.all([
      this.repo.findAddresses(id),
      this.repo.findLatestConsents(id),
      this.repo.getOrderSummary(id),
    ]);

    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      status: customer.status,
      loyaltyPoints: customer.profile?.loyaltyPoints ?? 0,
      dateOfBirth: customer.profile?.dateOfBirth ?? null,
      gender: customer.profile?.gender ?? null,
      addresses,
      consents,
      orderSummary,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async updateCustomerStatus(
    id: string,
    status: UserStatus,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) {
      throw AppError.notFound('Customer not found');
    }

    await this.authRepo.updateUser(id, { status });

    // If suspended, revoke sessions immediately
    if (status === 'SUSPENDED') {
      await this.authRepo.revokeAllUserSessions(id);
    }

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_CUSTOMER_STATUS_CHANGED',
      targetType: 'CUSTOMER',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { previousStatus: customer.status, newStatus: status },
    });
  }

  async addCustomerNote(
    customerId: string,
    note: string,
    actor: AccessTokenPayload,
  ): Promise<CustomerNoteItem> {
    const customer = await this.repo.findCustomerById(customerId);
    if (!customer) {
      throw AppError.notFound('Customer not found');
    }

    return this.repo.addCustomerNote(customerId, actor.userId, note);
  }

  async getCustomerNotes(customerId: string): Promise<CustomerNoteItem[]> {
    const customer = await this.repo.findCustomerById(customerId);
    if (!customer) {
      throw AppError.notFound('Customer not found');
    }

    return this.repo.getCustomerNotes(customerId);
  }

  async getCustomerTimeline(customerId: string): Promise<CustomerTimelineItem[]> {
    const customer = await this.repo.findCustomerById(customerId);
    if (!customer) {
      throw AppError.notFound('Customer not found');
    }

    return this.repo.getCustomerTimeline(customerId);
  }
}

export const customersService = new CustomersService();
