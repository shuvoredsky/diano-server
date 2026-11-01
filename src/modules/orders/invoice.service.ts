import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { siteSettingsService } from '@/modules/site-settings/site-settings.service';
import type { StoreProfileSetting, InvoiceSetting } from '@/modules/site-settings/site-settings.types';
import type { OrderEntity } from './orders.types';
import { toMoneyString } from '@/utils/currency.util';

export const ALLOWED_LOGO_HOSTS = ['res.cloudinary.com'];
const BENGALI_FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Regular.ttf');

export async function fetchLogoBufferSafe(logoUrl?: string | null): Promise<Buffer | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;

  try {
    const parsed = new URL(logoUrl);
    // Strict SSRF check: https only and allowlisted host
    if (parsed.protocol !== 'https:' || !ALLOWED_LOGO_HOSTS.includes(parsed.hostname.toLowerCase())) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(logoUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) {
      // 2MB size cap
      return null;
    }

    return Buffer.from(arrayBuffer);
  } catch {
    // Fail gracefully without crashing invoice generation
    return null;
  }
}

export class InvoiceService {
  /**
   * Generates next sequential invoice number in format INV-YYMM-XXXXX (Dhaka timezone)
   */
  async getNextInvoiceNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
    const monthPrefix = formatInTimeZone(new Date(), 'Asia/Dhaka', 'yyMM');
    const seqKey = `INVOICE-${monthPrefix}`;

    const seqResult = await tx.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "AppSequence" ("key", "lastValue", "updatedAt")
      VALUES (${seqKey}, 1, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "lastValue" = "AppSequence"."lastValue" + 1, "updatedAt" = NOW()
      RETURNING "lastValue"
    `;

    const seq = seqResult[0]?.lastValue ?? 1;
    return `INV-${monthPrefix}-${String(seq).padStart(5, '0')}`;
  }

  /**
   * Freezes invoice snapshot in OrderInvoiceSnapshot table if not already present
   */
  async getOrCreateInvoiceSnapshot(
    orderId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<{
    invoiceNumber: string;
    storeProfile: StoreProfileSetting;
    invoiceSettings: InvoiceSetting;
    issuedAt: Date;
  }> {
    const existing = await tx.orderInvoiceSnapshot.findUnique({
      where: { orderId },
    });

    if (existing) {
      return {
        invoiceNumber: existing.invoiceNumber,
        storeProfile: existing.storeProfile as unknown as StoreProfileSetting,
        invoiceSettings: existing.invoiceSettings as unknown as InvoiceSetting,
        issuedAt: existing.issuedAt,
      };
    }

    const storeProfile = await siteSettingsService.getSettingGroup<StoreProfileSetting>('store_profile');
    const invoiceSettings = await siteSettingsService.getSettingGroup<InvoiceSetting>('invoice');
    const invoiceNumber = await this.getNextInvoiceNumber(tx);

    const created = await tx.orderInvoiceSnapshot.create({
      data: {
        orderId,
        invoiceNumber,
        storeProfile: storeProfile as unknown as Prisma.InputJsonValue,
        invoiceSettings: invoiceSettings as unknown as Prisma.InputJsonValue,
        issuedAt: new Date(),
      },
    });

    return {
      invoiceNumber: created.invoiceNumber,
      storeProfile,
      invoiceSettings,
      issuedAt: created.issuedAt,
    };
  }

  /**
   * Generates high-fidelity PDF invoice for the specified order
   */
  async generateInvoicePdf(order: OrderEntity): Promise<{ buffer: Buffer; filename: string }> {
    const snapshot = await this.getOrCreateInvoiceSnapshot(order.id);
    const storeProfile = snapshot.storeProfile;
    const invoiceSettings = snapshot.invoiceSettings;
    const invoiceNumber = snapshot.invoiceNumber;

    let logoBuffer: Buffer | null = null;
    if (invoiceSettings.showLogo && storeProfile.logo) {
      logoBuffer = await fetchLogoBufferSafe(storeProfile.logo);
    }

    return new Promise<{ buffer: Buffer; filename: string }>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(buffers),
          filename: `${invoiceNumber}.pdf`,
        });
      });
      doc.on('error', err => reject(err));

      const hasBengaliFont = fs.existsSync(BENGALI_FONT_PATH);
      if (hasBengaliFont) {
        doc.registerFont('Bengali', BENGALI_FONT_PATH);
      }

      const fontRegular = hasBengaliFont ? 'Bengali' : 'Helvetica';
      const fontBold = hasBengaliFont ? 'Bengali' : 'Helvetica-Bold';

      // 1. Header Section
      let topY = 40;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 40, topY, { width: 100, height: 40, fit: [100, 40] });
          topY += 45;
        } catch {
          // If image decoding fails, fallback to text title
          doc.font(fontBold).fontSize(16).text(storeProfile.storeName, 40, topY);
          topY += 20;
        }
      } else {
        doc.font(fontBold).fontSize(18).text(storeProfile.storeName, 40, topY);
        topY += 22;
      }

      if (storeProfile.tagline) {
        doc.font(fontRegular).fontSize(9).fillColor('#666666').text(storeProfile.tagline, 40, topY);
        topY += 14;
      }
      doc.font(fontRegular).fontSize(9).fillColor('#444444').text(storeProfile.address, 40, topY);
      topY += 12;
      doc.text(`Phone: ${storeProfile.phone} | Email: ${storeProfile.email}`, 40, topY);
      topY += 12;
      if (storeProfile.businessRegistration) {
        doc.text(`BIN / VAT: ${storeProfile.businessRegistration}`, 40, topY);
        topY += 12;
      }

      // Invoice Details Block (Right aligned)
      doc.font(fontBold).fontSize(20).fillColor('#111827').text('INVOICE', 350, 40, { align: 'right' });
      doc.font(fontRegular).fontSize(10).fillColor('#374151');
      doc.text(`Invoice No: ${invoiceNumber}`, 350, 65, { align: 'right' });
      doc.text(`Order No: ${order.orderNumber}`, 350, 80, { align: 'right' });
      doc.text(
        `Date: ${formatInTimeZone(snapshot.issuedAt, 'Asia/Dhaka', 'yyyy-MM-dd')}`,
        350,
        95,
        { align: 'right' },
      );
      doc.text(`Payment: ${order.paymentMethod} (${order.paymentStatus})`, 350, 110, { align: 'right' });

      // Divider
      doc.moveTo(40, Math.max(topY + 10, 135)).lineTo(555, Math.max(topY + 10, 135)).strokeColor('#E5E7EB').stroke();

      // 2. Bill To & Shipping Information
      const infoY = Math.max(topY + 20, 145);
      doc.font(fontBold).fontSize(10).fillColor('#111827').text('BILL TO:', 40, infoY);
      doc.font(fontRegular).fontSize(9).fillColor('#374151');
      doc.text(order.customerSnapshot.name, 40, infoY + 14);
      doc.text(`Phone: ${order.customerSnapshot.phone}`, 40, infoY + 26);
      if (order.customerSnapshot.email) {
        doc.text(`Email: ${order.customerSnapshot.email}`, 40, infoY + 38);
      }

      doc.font(fontBold).fontSize(10).fillColor('#111827').text('SHIPPING ADDRESS:', 300, infoY);
      doc.font(fontRegular).fontSize(9).fillColor('#374151');
      doc.text(order.shippingAddressSnapshot.address, 300, infoY + 14);
      doc.text(
        `${order.shippingAddressSnapshot.area}, ${order.shippingAddressSnapshot.district}`,
        300,
        infoY + 26,
      );

      // 3. Items Table Header
      let tableY = infoY + 65;
      doc.rect(40, tableY, 515, 22).fill('#F3F4F6');
      doc.fillColor('#111827').font(fontBold).fontSize(9);
      doc.text('Item Description', 45, tableY + 6);
      doc.text('SKU', 260, tableY + 6);
      doc.text('Qty', 350, tableY + 6, { width: 40, align: 'right' });
      doc.text('Unit Price', 400, tableY + 6, { width: 70, align: 'right' });
      doc.text('Total (BDT)', 480, tableY + 6, { width: 70, align: 'right' });

      tableY += 26;

      // Table Rows
      doc.font(fontRegular).fontSize(9).fillColor('#374151');
      for (const item of order.items) {
        const itemTitle = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
        doc.text(itemTitle, 45, tableY, { width: 210 });
        doc.text(item.sku || '-', 260, tableY, { width: 85 });
        doc.text(String(item.quantity), 350, tableY, { width: 40, align: 'right' });
        doc.text(toMoneyString(Number(item.unitPrice)), 400, tableY, { width: 70, align: 'right' });
        doc.text(toMoneyString(Number(item.lineTotal)), 480, tableY, { width: 70, align: 'right' });

        tableY += 20;
        doc.moveTo(40, tableY - 4).lineTo(555, tableY - 4).strokeColor('#F3F4F6').stroke();
      }

      // 4. Totals Summary Box
      tableY += 10;
      const summaryLeft = 360;
      doc.font(fontRegular).fontSize(9).fillColor('#4B5563');
      doc.text('Subtotal:', summaryLeft, tableY);
      doc.text(`BDT ${toMoneyString(Number(order.subtotal))}`, 460, tableY, { width: 90, align: 'right' });

      tableY += 15;
      doc.text('Discount:', summaryLeft, tableY);
      doc.text(`- BDT ${toMoneyString(Number(order.discountTotal))}`, 460, tableY, { width: 90, align: 'right' });

      tableY += 15;
      doc.text('Shipping Charge:', summaryLeft, tableY);
      doc.text(`+ BDT ${toMoneyString(Number(order.shippingTotal))}`, 460, tableY, { width: 90, align: 'right' });

      tableY += 15;
      doc.text('Tax / VAT:', summaryLeft, tableY);
      doc.text(`+ BDT ${toMoneyString(Number(order.taxTotal))}`, 460, tableY, { width: 90, align: 'right' });

      tableY += 18;
      doc.rect(summaryLeft - 5, tableY - 4, 200, 24).fill('#E5E7EB');
      doc.font(fontBold).fontSize(11).fillColor('#111827');
      doc.text('Grand Total:', summaryLeft, tableY + 2);
      doc.text(`BDT ${toMoneyString(Number(order.grandTotal))}`, 460, tableY + 2, { width: 90, align: 'right' });

      // 5. Footer & Terms Note
      const footerY = 720;
      doc.moveTo(40, footerY - 10).lineTo(555, footerY - 10).strokeColor('#E5E7EB').stroke();

      if (invoiceSettings.termsNote) {
        doc.font(fontRegular).fontSize(8).fillColor('#6B7280').text(invoiceSettings.termsNote, 40, footerY, {
          width: 360,
        });
      }

      if (invoiceSettings.signatureText) {
        doc.font(fontBold).fontSize(8).fillColor('#374151').text(invoiceSettings.signatureText, 420, footerY + 20, {
          align: 'center',
          width: 130,
        });
        doc.moveTo(420, footerY + 18).lineTo(550, footerY + 18).strokeColor('#9CA3AF').stroke();
      }

      if (invoiceSettings.footerNote) {
        doc.font(fontRegular).fontSize(8).fillColor('#9CA3AF').text(invoiceSettings.footerNote, 40, footerY + 45, {
          align: 'center',
          width: 515,
        });
      }

      doc.end();
    });
  }
}

export const invoiceService = new InvoiceService();
