import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAllowedTransition,
  assertValidTransition,
  canCustomerCancel,
  getRequiredPermissionForTransition,
} from '@/modules/orders/orders.state-machine';
import { fetchLogoBufferSafe, InvoiceService } from '@/modules/orders/invoice.service';
import { OrdersService } from '@/modules/orders/orders.service';
import type { OrderEntity } from '@/modules/orders/orders.types';
import { AppError } from '@/utils/app-error';
import { formatInTimeZone } from 'date-fns-tz';

describe('Orders & Invoice Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. STATE MACHINE SPECIFICATION
  // ============================================================================
  describe('Order State Machine', () => {
    it('should validate all permitted forward transitions', () => {
      expect(isAllowedTransition('PENDING', 'CONFIRMED')).toBe(true);
      expect(isAllowedTransition('CONFIRMED', 'PROCESSING')).toBe(true);
      expect(isAllowedTransition('PROCESSING', 'PACKED')).toBe(true);
      expect(isAllowedTransition('PACKED', 'SHIPPED')).toBe(true);
      expect(isAllowedTransition('SHIPPED', 'DELIVERED')).toBe(true);
      expect(isAllowedTransition('DELIVERED', 'RETURNED')).toBe(true);
      expect(isAllowedTransition('RETURNED', 'REFUNDED')).toBe(true);
    });

    it('should allow cancellations from pre-fulfillment statuses', () => {
      expect(isAllowedTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(isAllowedTransition('CONFIRMED', 'CANCELLED')).toBe(true);
      expect(isAllowedTransition('PROCESSING', 'CANCELLED')).toBe(true);
      expect(isAllowedTransition('PACKED', 'CANCELLED')).toBe(true);
    });

    it('should disallow cancellation after shipment or delivery', () => {
      expect(isAllowedTransition('SHIPPED', 'CANCELLED')).toBe(false);
      expect(isAllowedTransition('DELIVERED', 'CANCELLED')).toBe(false);
      expect(isAllowedTransition('RETURNED', 'CANCELLED')).toBe(false);
    });

    it('should disallow terminal state transitions', () => {
      expect(isAllowedTransition('CANCELLED', 'CONFIRMED')).toBe(false);
      expect(isAllowedTransition('REFUNDED', 'DELIVERED')).toBe(false);
      expect(isAllowedTransition('DELIVERED', 'CONFIRMED')).toBe(false);
    });

    it('should treat same-state transition as idempotent valid', () => {
      expect(isAllowedTransition('PENDING', 'PENDING')).toBe(true);
      expect(isAllowedTransition('CONFIRMED', 'CONFIRMED')).toBe(true);
      expect(() => assertValidTransition('CONFIRMED', 'CONFIRMED')).not.toThrow();
    });

    it('should throw 409 Conflict on invalid state transition', () => {
      expect(() => assertValidTransition('PENDING', 'DELIVERED')).toThrow(AppError);
      try {
        assertValidTransition('PENDING', 'DELIVERED');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.message).toContain("Invalid order status transition from 'PENDING' to 'DELIVERED'");
      }
    });

    it('should assign correct granular permission per transition', () => {
      expect(getRequiredPermissionForTransition('CONFIRMED')).toBe('order:confirm');
      expect(getRequiredPermissionForTransition('SHIPPED')).toBe('order:ship');
      expect(getRequiredPermissionForTransition('CANCELLED')).toBe('order:cancel');
      expect(getRequiredPermissionForTransition('PROCESSING')).toBe('order:update_status');
    });

    it('should enforce that customers can only cancel PENDING COD orders', () => {
      expect(canCustomerCancel({ status: 'PENDING', paymentMethod: 'COD' })).toBe(true);
      expect(canCustomerCancel({ status: 'CONFIRMED', paymentMethod: 'COD' })).toBe(false);
      expect(canCustomerCancel({ status: 'PENDING', paymentMethod: 'BKASH' })).toBe(false);
      expect(canCustomerCancel({ status: 'PENDING', paymentMethod: 'SSLCOMMERZ' })).toBe(false);
    });
  });

  // ============================================================================
  // 2. ORDER NUMBER FORMAT SPECIFICATION
  // ============================================================================
  describe('Order Number Generation', () => {
    it('should adhere to DN-YYMMDD-XXXXX format in Asia/Dhaka time', () => {
      const dhakaDatePrefix = formatInTimeZone(new Date(), 'Asia/Dhaka', 'yyMMdd');
      const sequenceNumber = 42;
      const orderNumber = `DN-${dhakaDatePrefix}-${String(sequenceNumber).padStart(5, '0')}`;

      expect(orderNumber).toMatch(/^DN-\d{6}-\d{5}$/);
      expect(orderNumber).toContain(`DN-${dhakaDatePrefix}-00042`);
    });
  });

  // ============================================================================
  // 3. IDEMPOTENCY & PAYLOAD HASHING
  // ============================================================================
  describe('Idempotency & Pricing Validation', () => {
    it('should compute deterministic payload hash', () => {
      const svc = new OrdersService({} as any, {} as any, {} as any, {} as any);
      const hash1 = svc.generatePayloadHash('sess-123', 'Please call before delivery');
      const hash2 = svc.generatePayloadHash('sess-123', 'Please call before delivery');
      const hash3 = svc.generatePayloadHash('sess-123', 'Different note');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should reject order creation if Idempotency-Key header is missing', async () => {
      const svc = new OrdersService({} as any, {} as any, {} as any, {} as any);
      await expect(
        svc.createOrder({ checkoutSessionId: 'sess-1', idempotencyKey: '' }),
      ).rejects.toThrow('Valid Idempotency-Key header is required');
    });

    it('should sanitize costPrice when user lacks order:view_cost permission', () => {
      const svc = new OrdersService({} as any, {} as any, {} as any, {} as any);
      const mockOrder: OrderEntity = {
        id: 'ord-1',
        orderNumber: 'DN-261101-00001',
        customerId: 'cust-1',
        status: 'PENDING',
        subtotal: '1000.00',
        discountTotal: '0.00',
        shippingTotal: '60.00',
        taxTotal: '0.00',
        grandTotal: '1060.00',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        shippingAddressSnapshot: { address: 'A', district: 'Dhaka', area: 'B' },
        customerSnapshot: { id: 'cust-1', name: 'N', phone: '01700000000', isGuest: false },
        placedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            productName: 'P',
            variantName: 'V',
            sku: 'SKU-1',
            unitPrice: '1000.00',
            costPrice: '600.00',
            quantity: 1,
            discount: '0.00',
            lineTotal: '1000.00',
          },
        ],
      };

      const sanitized = svc.sanitizeOrder(mockOrder, false);
      expect(sanitized.items[0]?.costPrice).toBeNull();

      const staffView = svc.sanitizeOrder(mockOrder, true);
      expect(staffView.items[0]?.costPrice).toBe('600.00');
    });
  });

  // ============================================================================
  // 4. PUBLIC ORDER TRACKING & GENERIC ERROR
  // ============================================================================
  describe('Public Order Tracking', () => {
    it('should return minimal safe information on matching order number and phone', async () => {
      const mockRepo = {
        findByOrderNumber: vi.fn().mockResolvedValue({
          orderNumber: 'DN-261101-00001',
          status: 'SHIPPED',
          placedAt: new Date('2026-11-01T10:00:00Z'),
          items: [{ quantity: 2 }, { quantity: 1 }],
          grandTotal: '1500.00',
          customerSnapshot: { phone: '01712345678' },
          shippingAddressSnapshot: { district: 'Dhaka' },
        }),
      };

      const svc = new OrdersService(mockRepo as any, {} as any, {} as any, {} as any);
      const res = await svc.trackOrder('DN-261101-00001', '01712345678');

      expect(res).toEqual({
        orderNumber: 'DN-261101-00001',
        status: 'SHIPPED',
        placedAt: '2026-11-01T10:00:00.000Z',
        itemCount: 3,
        totalAmount: '1500.00',
        shippingDistrict: 'Dhaka',
      });
      // Sensitive snapshots must NOT be exposed
      expect((res as any).customerSnapshot).toBeUndefined();
      expect((res as any).items).toBeUndefined();
    });

    it('should throw generic 404 error when phone or order does not match', async () => {
      const mockRepo = {
        findByOrderNumber: vi.fn().mockResolvedValue({
          orderNumber: 'DN-261101-00001',
          customerSnapshot: { phone: '01712345678' },
        }),
      };

      const svc = new OrdersService(mockRepo as any, {} as any, {} as any, {} as any);

      // Wrong phone
      await expect(svc.trackOrder('DN-261101-00001', '01899999999')).rejects.toThrow(
        'No order found matching the provided order number and phone',
      );

      // Non-existent order
      mockRepo.findByOrderNumber.mockResolvedValue(null);
      await expect(svc.trackOrder('DN-UNKNOWN', '01712345678')).rejects.toThrow(
        'No order found matching the provided order number and phone',
      );
    });
  });

  // ============================================================================
  // 5. INVOICE SERVICE & SSRF SAFETY
  // ============================================================================
  describe('Invoice Service & SSRF Safety', () => {
    it('should strictly reject unallowlisted logo host URLs', async () => {
      expect(await fetchLogoBufferSafe('http://res.cloudinary.com/image.png')).toBeNull(); // http rejected
      expect(await fetchLogoBufferSafe('https://evil.com/malicious.png')).toBeNull(); // evil host rejected
      expect(await fetchLogoBufferSafe('https://res.cloudinary.com.attacker.com/fake.png')).toBeNull(); // subdomain spoofing rejected
      expect(await fetchLogoBufferSafe('javascript:alert(1)')).toBeNull();
      expect(await fetchLogoBufferSafe('data:image/png;base64,...')).toBeNull();
    });

    it('should generate valid PDF buffer starting with %PDF even without logo', async () => {
      const invoiceSvc = new InvoiceService();
      vi.spyOn(invoiceSvc, 'getOrCreateInvoiceSnapshot').mockResolvedValue({
        invoiceNumber: 'INV-2611-00001',
        storeProfile: {
          storeName: 'Diano Fashion ডিয়ানো',
          tagline: 'Premium Minimalist Fashion',
          phone: '+8801700000000',
          email: 'support@diano.com.bd',
          address: 'Tejgaon, Dhaka',
        },
        invoiceSettings: {
          prefix: 'INV',
          footerNote: 'Thank you for shopping.',
          termsNote: '7 days warranty.',
          showLogo: true,
          signatureText: 'Authorized Signatory',
        },
        issuedAt: new Date(),
      });

      const mockOrder: OrderEntity = {
        id: 'ord-test-1',
        orderNumber: 'DN-261101-00001',
        customerId: 'cust-1',
        status: 'CONFIRMED',
        subtotal: '2500.00',
        discountTotal: '200.00',
        shippingTotal: '60.00',
        taxTotal: '0.00',
        grandTotal: '2360.00',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        shippingAddressSnapshot: { address: 'House 12, Road 4', district: 'Dhaka', area: 'Mirpur' },
        customerSnapshot: { id: 'cust-1', name: 'Rahim Khan', phone: '01700000000', isGuest: false },
        placedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            productName: 'Oxford Cotton Shirt অক্সফোর্ড শার্ট',
            variantName: 'White / L',
            sku: 'OXF-WHT-L',
            unitPrice: '1250.00',
            costPrice: '700.00',
            quantity: 2,
            discount: '0.00',
            lineTotal: '2500.00',
          },
        ],
      };

      const result = await invoiceSvc.generateInvoicePdf(mockOrder);
      expect(result.filename).toBe('INV-2611-00001.pdf');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});
