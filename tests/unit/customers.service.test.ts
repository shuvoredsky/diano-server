import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomersService } from '@/modules/customers/customers.service';
import type { ICustomersRepository, CustomerAddressDto } from '@/modules/customers/customers.types';
import type { IAuthRepository, UserWithRoles } from '@/modules/auth/auth.types';
import type { IAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';

describe('CustomersService (Unit Tests)', () => {
  let service: CustomersService;
  let mockRepo: vi.Mocked<ICustomersRepository>;
  let mockAuthRepo: vi.Mocked<IAuthRepository>;
  let mockAuditSvc: vi.Mocked<IAuditService>;

  const customerId = 'cust_123';
  const otherCustomerId = 'cust_456';

  const adminActor: AccessTokenPayload = {
    userId: 'admin_1',
    sessionId: 'session_admin',
    roles: ['admin'],
    email: 'admin@diano.com',
  };

  const createMockAddress = (overrides: Partial<CustomerAddressDto> = {}): CustomerAddressDto => ({
    id: 'addr_1',
    userId: customerId,
    type: 'SHIPPING',
    isDefault: true,
    fullName: 'Customer Name',
    phone: '+8801712345678',
    alternativePhone: null,
    addressLine: 'House 12, Road 4',
    district: 'Dhaka',
    city: 'Dhaka',
    area: 'Gulshan',
    postalCode: '1212',
    landmark: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockRepo = {
      findCustomers: vi.fn(),
      findCustomerById: vi.fn(),
      updateCustomerProfile: vi.fn(),
      findAddresses: vi.fn(),
      findAddressById: vi.fn(),
      countAddresses: vi.fn().mockResolvedValue(1),
      createAddress: vi.fn(),
      updateAddress: vi.fn(),
      clearDefaultAddress: vi.fn().mockResolvedValue(undefined),
      deleteAddress: vi.fn().mockResolvedValue(undefined),
      findLatestConsents: vi.fn(),
      recordConsent: vi.fn().mockResolvedValue(undefined),
      findConsentHistory: vi.fn(),
      getCustomerNotes: vi.fn(),
      addCustomerNote: vi.fn(),
      getCustomerTimeline: vi.fn(),
      getOrderSummary: vi.fn().mockResolvedValue({
        totalOrders: 0,
        totalSpent: '0.00',
        cancelledOrders: 0,
        returnedOrders: 0,
      }),
      anonymizeAndSoftDelete: vi.fn().mockResolvedValue(undefined),
    };

    mockAuthRepo = {
      findUserByEmail: vi.fn(),
      findUserByPhone: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({} as unknown as UserWithRoles),
      incrementFailedLogin: vi.fn(),
      resetFailedLogin: vi.fn(),
      createSession: vi.fn(),
      findSessionById: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
      createRefreshToken: vi.fn(),
      findRefreshTokenByHash: vi.fn(),
      markRefreshTokenUsed: vi.fn(),
      revokeRefreshTokenFamily: vi.fn(),
      createLoginHistory: vi.fn(),
      getLoginHistory: vi.fn().mockResolvedValue([]),
      createEmailVerificationToken: vi.fn(),
      findEmailVerificationToken: vi.fn(),
      deleteEmailVerificationToken: vi.fn(),
      createPasswordResetToken: vi.fn(),
      findPasswordResetToken: vi.fn(),
      deletePasswordResetToken: vi.fn(),
      createOtpCode: vi.fn(),
      findLatestValidOtp: vi.fn(),
      incrementOtpAttempts: vi.fn(),
      markOtpUsed: vi.fn(),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new CustomersService(mockRepo, mockAuthRepo, mockAuditSvc);
  });

  describe('Address Book & Ownership', () => {
    it('should reject address creation when max address limit (10) is reached', async () => {
      mockRepo.countAddresses.mockResolvedValue(10); // Limit reached

      await expect(
        service.addAddress(customerId, {
          fullName: 'Test',
          phone: '+8801712345678',
          addressLine: '123 Test Street',
          district: 'Dhaka',
          city: 'Dhaka',
        }),
      ).rejects.toThrowError(/Maximum 10 addresses allowed per customer/);
    });

    it('should switch default address when creating a new default address', async () => {
      mockRepo.countAddresses.mockResolvedValue(2);
      mockRepo.createAddress.mockResolvedValue(createMockAddress({ isDefault: true }));

      await service.addAddress(customerId, {
        fullName: 'New Home',
        phone: '+8801712345678',
        addressLine: '123 Test Street',
        district: 'Dhaka',
        city: 'Dhaka',
        type: 'SHIPPING',
        isDefault: true,
      });

      expect(mockRepo.clearDefaultAddress).toHaveBeenCalledWith(customerId, 'SHIPPING');
      expect(mockRepo.createAddress).toHaveBeenCalled();
    });

    it('should block customer from modifying another customer address (ownership protection)', async () => {
      // Address belongs to otherCustomerId
      const foreignAddress = createMockAddress({ userId: otherCustomerId });
      mockRepo.findAddressById.mockResolvedValue(foreignAddress);

      await expect(
        service.updateAddress(customerId, 'addr_1', { fullName: 'Hacker Attempt' }),
      ).rejects.toThrowError(/You do not have permission to modify this address/);
    });

    it('should block customer from deleting another customer address (ownership protection)', async () => {
      const foreignAddress = createMockAddress({ userId: otherCustomerId });
      mockRepo.findAddressById.mockResolvedValue(foreignAddress);

      await expect(service.deleteAddress(customerId, 'addr_1')).rejects.toThrowError(
        /You do not have permission to delete this address/,
      );
    });
  });

  describe('Consents & Privacy', () => {
    it('should record consent updates and record audit log', async () => {
      mockRepo.findLatestConsents.mockResolvedValue([
        { channel: 'EMAIL', purpose: 'MARKETING', isGranted: true },
      ]);

      const result = await service.updateConsents(customerId, {
        consents: [{ channel: 'EMAIL', purpose: 'MARKETING', isGranted: true }],
      });

      expect(mockRepo.recordConsent).toHaveBeenCalledWith(
        customerId,
        expect.objectContaining({ channel: 'EMAIL', purpose: 'MARKETING', isGranted: true }),
        undefined,
      );
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_CONSENTS_UPDATED' }),
      );
      expect(result).toHaveLength(1);
    });

    it('should compile complete customer data export', async () => {
      mockRepo.findCustomerById.mockResolvedValue({
        id: customerId,
        email: 'user@diano.com',
        name: 'Export User',
        phone: '+8801712345678',
        avatarUrl: null,
        createdAt: new Date(),
        profile: { dateOfBirth: null, gender: 'FEMALE' },
      });
      mockRepo.findAddresses.mockResolvedValue([createMockAddress()]);
      mockRepo.findConsentHistory.mockResolvedValue([
        { channel: 'SMS', purpose: 'MARKETING', isGranted: true, grantedAt: new Date(), revokedAt: null },
      ]);
      mockAuthRepo.getLoginHistory.mockResolvedValue([]);

      const exported = await service.exportData(customerId);

      expect(exported.profile.email).toBe('user@diano.com');
      expect(exported.addresses).toHaveLength(1);
      expect(exported.consentRecords).toHaveLength(1);
    });

    it('should anonymize personal data, soft-delete, and revoke all sessions on account deletion', async () => {
      mockRepo.findCustomerById.mockResolvedValue({ id: customerId });

      await service.deleteAccount(customerId);

      expect(mockRepo.anonymizeAndSoftDelete).toHaveBeenCalledWith(customerId);
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(customerId);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_ACCOUNT_DELETED_ANONYMIZED' }),
      );
    });
  });

  describe('Admin Customer Management', () => {
    it('should retrieve customer details with accurate initial order summary', async () => {
      mockRepo.findCustomerById.mockResolvedValue({
        id: customerId,
        email: 'cust@diano.com',
        name: 'Valued Customer',
        phone: '+8801712345678',
        avatarUrl: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: { loyaltyPoints: 50 },
      });
      mockRepo.findAddresses.mockResolvedValue([]);
      mockRepo.findLatestConsents.mockResolvedValue([]);

      const detail = await service.getCustomerDetail(customerId);

      expect(detail.id).toBe(customerId);
      expect(detail.orderSummary.totalOrders).toBe(0);
      expect(detail.orderSummary.totalSpent).toBe('0.00');
    });

    it('should revoke all customer sessions when admin suspends customer account', async () => {
      mockRepo.findCustomerById.mockResolvedValue({ id: customerId, status: 'ACTIVE' });

      await service.updateCustomerStatus(customerId, 'SUSPENDED', adminActor);

      expect(mockAuthRepo.updateUser).toHaveBeenCalledWith(customerId, { status: 'SUSPENDED' });
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(customerId);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_CUSTOMER_STATUS_CHANGED' }),
      );
    });

    it('should add admin customer note and fetch timeline', async () => {
      mockRepo.findCustomerById.mockResolvedValue({ id: customerId });
      mockRepo.addCustomerNote.mockResolvedValue({
        id: 'note_1',
        authorId: adminActor.userId,
        note: 'Customer requested address update via phone',
        createdAt: new Date(),
      });

      const note = await service.addCustomerNote(
        customerId,
        'Customer requested address update via phone',
        adminActor,
      );

      expect(note.note).toContain('address update');
      expect(mockRepo.addCustomerNote).toHaveBeenCalled();
    });
  });
});
