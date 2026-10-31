import type { UserStatus, AddressType, ConsentChannel } from '@prisma/client';
import type { PaginationResult } from '@/utils/pagination';

export interface CustomerSummaryItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  loyaltyPoints: number;
  totalSpent: string;
  ordersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CustomerFilterOptions extends PaginationResult {
  search?: string;
  status?: UserStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CustomerAddressDto {
  id: string;
  userId: string;
  type: AddressType;
  isDefault: boolean;
  fullName: string;
  phone: string;
  alternativePhone: string | null;
  addressLine: string;
  district: string;
  city: string;
  area: string | null;
  postalCode: string | null;
  landmark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressInput {
  type?: AddressType;
  isDefault?: boolean;
  fullName: string;
  phone: string;
  alternativePhone?: string;
  addressLine: string;
  district: string;
  city: string;
  area?: string;
  postalCode?: string;
  landmark?: string;
}

export interface UpdateAddressInput {
  type?: AddressType;
  isDefault?: boolean;
  fullName?: string;
  phone?: string;
  alternativePhone?: string;
  addressLine?: string;
  district?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  landmark?: string;
}

export interface ConsentPreferenceItem {
  channel: ConsentChannel;
  purpose: 'MARKETING' | 'RECOVERY' | 'ANALYTICS';
  isGranted: boolean;
}

export interface UpdateConsentsInput {
  consents: ConsentPreferenceItem[];
}

export interface CustomerNoteItem {
  id: string;
  authorId: string | null;
  note: string;
  createdAt: Date;
}

export interface CustomerTimelineItem {
  id: string;
  type: 'LOGIN' | 'NOTE' | 'STATUS_CHANGE' | 'CONSENT';
  title: string;
  description: string | null;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CustomerOrderSummary {
  totalOrders: number;
  totalSpent: string;
  cancelledOrders: number;
  returnedOrders: number;
}

export interface CustomerDetailAdminView {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  loyaltyPoints: number;
  dateOfBirth: Date | null;
  gender: string | null;
  addresses: CustomerAddressDto[];
  consents: ConsentPreferenceItem[];
  orderSummary: CustomerOrderSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerExportData {
  profile: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    avatarUrl: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    createdAt: Date;
  };
  addresses: CustomerAddressDto[];
  consentRecords: Array<{
    channel: ConsentChannel;
    purpose: string;
    isGranted: boolean;
    grantedAt: Date;
    revokedAt: Date | null;
  }>;
  recentLogins: Array<{
    ip: string | null;
    device: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>;
}

export interface CustomerRecord {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    loyaltyPoints: number;
    totalSpent: { toString(): string } | number;
    ordersCount: number;
    gender: string | null;
    dateOfBirth: Date | null;
  } | null;
}

export interface CustomerWithDetails extends CustomerRecord {
  addresses: CustomerAddressDto[];
}

export interface ConsentRecordItem {
  id: string;
  channel: ConsentChannel;
  purpose: string;
  isGranted: boolean;
  grantedAt: Date;
  revokedAt: Date | null;
}

export interface ICustomersRepository {
  findCustomers(filter: CustomerFilterOptions): Promise<{ items: CustomerRecord[]; total: number }>;
  findCustomerById(id: string): Promise<CustomerWithDetails | null>;
  updateCustomerProfile(
    userId: string,
    data: { name?: string; phone?: string; avatarUrl?: string; gender?: string; dateOfBirth?: Date },
  ): Promise<CustomerRecord | null>;
  findAddresses(userId: string): Promise<CustomerAddressDto[]>;
  findAddressById(addressId: string): Promise<CustomerAddressDto | null>;
  countAddresses(userId: string): Promise<number>;
  createAddress(userId: string, data: CreateAddressInput): Promise<CustomerAddressDto>;
  updateAddress(addressId: string, data: UpdateAddressInput): Promise<CustomerAddressDto>;
  clearDefaultAddress(userId: string, type: AddressType): Promise<void>;
  deleteAddress(addressId: string): Promise<void>;
  findLatestConsents(userId: string): Promise<ConsentPreferenceItem[]>;
  recordConsent(
    userId: string,
    item: ConsentPreferenceItem,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void>;
  findConsentHistory(userId: string): Promise<ConsentRecordItem[]>;
  getCustomerNotes(customerId: string): Promise<CustomerNoteItem[]>;
  addCustomerNote(customerId: string, authorId: string, note: string): Promise<CustomerNoteItem>;
  getCustomerTimeline(customerId: string): Promise<CustomerTimelineItem[]>;
  getOrderSummary(customerId: string): Promise<CustomerOrderSummary>;
  anonymizeAndSoftDelete(userId: string): Promise<void>;
}
