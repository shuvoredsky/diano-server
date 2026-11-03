import type { Response } from 'express';
import { stringify } from 'csv-stringify';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '@/config/database';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { resolvePeriod } from '@/modules/analytics/period.util';
import {
  sanitizeCellValue,
  maskPhone,
  maskEmail,
  type ReportContext,
} from './reports.types';
import type {
  ordersReportSchema,
  salesReportSchema,
  inventoryReportSchema,
  customersReportSchema,
  financialReportSchema,
} from './reports.validation';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';

type OrdersFilter = z.infer<typeof ordersReportSchema>;
type SalesFilter = z.infer<typeof salesReportSchema>;
type InventoryFilter = z.infer<typeof inventoryReportSchema>;
type CustomersFilter = z.infer<typeof customersReportSchema>;
type FinancialFilter = z.infer<typeof financialReportSchema>;

export class ReportsService {
  constructor(private readonly audit: IAuditService = auditService) {}

  private checkRowLimit(count: number): void {
    const maxRows = env.REPORT_MAX_ROWS || 20000;
    if (count > maxRows) {
      throw new AppError(
        `Export exceeds maximum row limit of ${maxRows}. Please narrow date range or filter.`,
        413,
      );
    }
  }

  private setDownloadHeaders(res: Response, filename: string, format: string): void {
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    } else if (format === 'xlsx') {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    }
  }

  private streamCsv(
    res: Response,
    columns: Array<{ key: string; header: string }>,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stringifier = stringify({
        header: true,
        columns: columns.map(c => ({ key: c.key, header: c.header })),
        cast: {
          string: (val: string) => sanitizeCellValue(val) as string,
        },
      });

      stringifier.on('error', reject);
      stringifier.on('finish', () => resolve());
      stringifier.pipe(res);

      for (const row of rows) {
        const sanitizedRow: Record<string, unknown> = {};
        for (const col of columns) {
          sanitizedRow[col.key] = sanitizeCellValue(row[col.key]);
        }
        stringifier.write(sanitizedRow);
      }
      stringifier.end();
    });
  }

  private async streamXlsx(
    res: Response,
    sheetName: string,
    columns: Array<{ key: string; header: string; width?: number }>,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
    });

    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns.map(c => ({
      header: c.header,
      key: c.key,
      width: c.width || 18,
    }));

    for (const row of rows) {
      const sanitizedRow: Record<string, unknown> = {};
      for (const col of columns) {
        sanitizedRow[col.key] = sanitizeCellValue(row[col.key]);
      }
      worksheet.addRow(sanitizedRow).commit();
    }

    worksheet.commit();
    await workbook.commit();
  }

  private generateSummaryPdf(
    res: Response,
    title: string,
    columns: Array<{ key: string; header: string }>,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      doc.on('error', reject);
      doc.pipe(res);

      doc.fontSize(16).text(title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#666666').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
      doc.moveDown(1);

      // Render summary table (max 1000 rows in PDF to keep memory lightweight)
      const pdfRows = rows.slice(0, 1000);
      const colWidth = Math.floor(535 / columns.length);

      // Table Header
      let y = doc.y;
      doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold');
      columns.forEach((col, i) => {
        doc.text(col.header, 30 + i * colWidth, y, { width: colWidth, lineBreak: false, ellipsis: true });
      });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      // Table Rows
      for (const row of pdfRows) {
        if (doc.y > 750) {
          doc.addPage();
        }
        y = doc.y;
        columns.forEach((col, i) => {
          const val = String(row[col.key] ?? '');
          doc.text(val, 30 + i * colWidth, y, { width: colWidth, lineBreak: false, ellipsis: true });
        });
        doc.moveDown(0.3);
      }

      if (rows.length > 1000) {
        doc.moveDown(1);
        doc.fillColor('#990000').text(`Note: Only first 1,000 of ${rows.length} rows displayed in PDF summary. For complete data, please export as CSV or XLSX.`, { align: 'center' });
      }

      doc.end();
      res.on('finish', () => resolve());
    });
  }

  async exportOrders(filters: OrdersFilter, ctx: ReportContext, res: Response): Promise<void> {
    const resolution = resolvePeriod(filters.period, filters.from, filters.to);

    const where: Prisma.OrderWhereInput = {
      placedAt: {
        gte: resolution.current.start,
        lt: resolution.current.end,
      },
    };

    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    const totalCount = await prisma.order.count({ where });
    this.checkRowLimit(totalCount);

    const orders = await prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        placedAt: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        subtotal: true,
        discountTotal: true,
        shippingTotal: true,
        taxTotal: true,
        grandTotal: true,
        customerSnapshot: true,
        shippingAddressSnapshot: true,
      },
    });

    const columns: Array<{ key: string; header: string; width?: number }> = [
      { key: 'orderNumber', header: 'Order Number', width: 16 },
      { key: 'placedAt', header: 'Placed At', width: 20 },
      { key: 'status', header: 'Status', width: 14 },
      { key: 'paymentStatus', header: 'Payment Status', width: 14 },
      { key: 'paymentMethod', header: 'Payment Method', width: 14 },
      { key: 'customerName', header: 'Customer Name', width: 20 },
      { key: 'customerPhone', header: 'Phone', width: 16 },
      { key: 'customerEmail', header: 'Email', width: 22 },
      { key: 'district', header: 'District', width: 16 },
      { key: 'subtotal', header: 'Subtotal', width: 14 },
      { key: 'discount', header: 'Discount', width: 12 },
      { key: 'shipping', header: 'Shipping', width: 12 },
      { key: 'tax', header: 'Tax', width: 12 },
      { key: 'grandTotal', header: 'Grand Total', width: 14 },
    ];

    const rows = orders.map(o => {
      const cust = (o.customerSnapshot as Record<string, unknown>) || {};
      const addr = (o.shippingAddressSnapshot as Record<string, unknown>) || {};

      const rawPhone = String(cust.phone || addr.phone || '');
      const rawEmail = String(cust.email || addr.email || '');

      return {
        orderNumber: o.orderNumber,
        placedAt: o.placedAt.toISOString(),
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        customerName: String(cust.name || addr.fullName || 'Guest'),
        customerPhone: ctx.canExportPii ? rawPhone : maskPhone(rawPhone),
        customerEmail: ctx.canExportPii ? rawEmail : maskEmail(rawEmail),
        district: String(addr.district || 'Unknown'),
        subtotal: o.subtotal.toString(),
        discount: o.discountTotal.toString(),
        shipping: o.shippingTotal.toString(),
        tax: o.taxTotal.toString(),
        grandTotal: o.grandTotal.toString(),
      };
    });

    this.setDownloadHeaders(res, `orders-report-${filters.period}`, filters.format);

    if (filters.format === 'csv') {
      await this.streamCsv(res, columns, rows);
    } else if (filters.format === 'xlsx') {
      await this.streamXlsx(res, 'Orders', columns, rows);
    } else {
      await this.generateSummaryPdf(res, 'Orders Summary Report', columns, rows);
    }

    await this.audit.record({
      actorId: ctx.userId,
      actorType: 'USER',
      action: 'REPORT_EXPORTED',
      targetType: 'Report',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        reportType: 'ORDERS',
        format: filters.format,
        rowCount: orders.length,
        filters,
      },
    });
  }

  async exportSales(filters: SalesFilter, ctx: ReportContext, res: Response): Promise<void> {
    const resolution = resolvePeriod(filters.period, filters.from, filters.to);

    const truncUnit = filters.group_by === 'month' ? 'month' : filters.group_by === 'week' ? 'week' : 'day';

    const rowsRaw = await prisma.$queryRaw<
      Array<{
        period_bucket: string;
        order_count: bigint;
        gross_sales: string;
        discounts: string;
        shipping: string;
        tax: string;
        net_sales: string;
      }>
    >`
      SELECT
        TO_CHAR(date_trunc(${truncUnit}, o."placedAt" AT TIME ZONE 'Asia/Dhaka'), 'YYYY-MM-DD') as period_bucket,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.subtotal), 0)::text as gross_sales,
        COALESCE(SUM(o."discountTotal"), 0)::text as discounts,
        COALESCE(SUM(o."shippingTotal"), 0)::text as shipping,
        COALESCE(SUM(o."taxTotal"), 0)::text as tax,
        COALESCE(SUM(o.subtotal - o."discountTotal"), 0)::text as net_sales
      FROM "Order" o
      WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
        AND o."placedAt" >= ${resolution.current.start} AND o."placedAt" < ${resolution.current.end}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    this.checkRowLimit(rowsRaw.length);

    const columns = [
      { key: 'periodBucket', header: 'Period', width: 16 },
      { key: 'orderCount', header: 'Order Count', width: 14 },
      { key: 'grossSales', header: 'Gross Sales', width: 16 },
      { key: 'discounts', header: 'Discounts', width: 14 },
      { key: 'shipping', header: 'Shipping', width: 14 },
      { key: 'tax', header: 'Tax', width: 12 },
      { key: 'netSales', header: 'Net Sales', width: 16 },
    ];

    const rows = rowsRaw.map(r => ({
      periodBucket: r.period_bucket,
      orderCount: Number(r.order_count),
      grossSales: r.gross_sales,
      discounts: r.discounts,
      shipping: r.shipping,
      tax: r.tax,
      netSales: r.net_sales,
    }));

    this.setDownloadHeaders(res, `sales-report-${filters.period}-${filters.group_by}`, filters.format);

    if (filters.format === 'csv') {
      await this.streamCsv(res, columns, rows);
    } else {
      await this.streamXlsx(res, 'Sales', columns, rows);
    }

    await this.audit.record({
      actorId: ctx.userId,
      actorType: 'USER',
      action: 'REPORT_EXPORTED',
      targetType: 'Report',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        reportType: 'SALES',
        format: filters.format,
        rowCount: rows.length,
        filters,
      },
    });
  }

  async exportInventory(filters: InventoryFilter, ctx: ReportContext, res: Response): Promise<void> {
    const variantWhere: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    if (filters.categoryId) {
      variantWhere.product = { categoryId: filters.categoryId };
    }

    const where: Prisma.InventoryWhereInput = {
      variant: variantWhere,
    };

    if (filters.warehouseId) where.warehouseId = filters.warehouseId;

    const totalCount = await prisma.inventory.count({ where });
    this.checkRowLimit(totalCount);

    const items = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: { select: { name: true, code: true } },
        variant: {
          select: {
            name: true,
            sku: true,
            price: true,
            costPrice: true,
            reorderLevel: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const filtered = filters.lowStockOnly
      ? items.filter(i => i.onHand <= i.variant.reorderLevel)
      : items;

    const columns: Array<{ key: string; header: string; width?: number }> = [
      { key: 'productName', header: 'Product', width: 24 },
      { key: 'variantName', header: 'Variant', width: 18 },
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'warehouse', header: 'Warehouse', width: 16 },
      { key: 'onHand', header: 'On Hand', width: 12 },
      { key: 'reserved', header: 'Reserved', width: 12 },
      { key: 'damaged', header: 'Damaged', width: 12 },
      { key: 'reorderLevel', header: 'Reorder Level', width: 14 },
      { key: 'sellingPrice', header: 'Price', width: 14 },
    ];

    if (ctx.canViewFinance) {
      columns.push(
        { key: 'costPrice', header: 'Cost Price', width: 14 },
        { key: 'valuation', header: 'Total Valuation', width: 16 },
      );
    }

    const rows = filtered.map(i => {
      const row: Record<string, unknown> = {
        productName: i.variant.product.name,
        variantName: i.variant.name,
        sku: i.variant.sku,
        warehouse: i.warehouse.name,
        onHand: i.onHand,
        reserved: i.reserved,
        damaged: i.damaged,
        reorderLevel: i.variant.reorderLevel,
        sellingPrice: i.variant.price.toString(),
      };

      if (ctx.canViewFinance) {
        const cost = i.variant.costPrice ? Number(i.variant.costPrice) : 0;
        row.costPrice = i.variant.costPrice ? i.variant.costPrice.toString() : 'N/A';
        row.valuation = (cost * i.onHand).toFixed(2);
      }

      return row;
    });

    this.setDownloadHeaders(res, 'inventory-report', filters.format);

    if (filters.format === 'csv') {
      await this.streamCsv(res, columns, rows);
    } else {
      await this.streamXlsx(res, 'Inventory', columns, rows);
    }

    await this.audit.record({
      actorId: ctx.userId,
      actorType: 'USER',
      action: 'REPORT_EXPORTED',
      targetType: 'Report',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        reportType: 'INVENTORY',
        format: filters.format,
        rowCount: rows.length,
        filters,
      },
    });
  }

  async exportCustomers(filters: CustomersFilter, ctx: ReportContext, res: Response): Promise<void> {
    const rawRows = await prisma.$queryRaw<
      Array<{
        customerId: string;
        fullName: string;
        email: string;
        phone: string | null;
        district: string | null;
        orderCount: bigint;
        totalSpend: string;
      }>
    >`
      SELECT
        o."customerId",
        u.name as "fullName",
        u.email,
        u.phone,
        COALESCE(o."shippingAddressSnapshot"->>'district', 'Unknown') as district,
        COUNT(o.id) as "orderCount",
        SUM(o."grandTotal")::text as "totalSpend"
      FROM "Order" o
      JOIN "User" u ON o."customerId" = u.id
      WHERE o.status != 'CANCELLED'
      GROUP BY o."customerId", u.name, u.email, u.phone, COALESCE(o."shippingAddressSnapshot"->>'district', 'Unknown')
      ${filters.minOrders ? Prisma.sql`HAVING COUNT(o.id) >= ${filters.minOrders}` : Prisma.empty}
      ORDER BY SUM(o."grandTotal") DESC
    `;

    let filtered = rawRows;
    if (filters.district) {
      filtered = rawRows.filter(
        r => r.district?.toLowerCase() === filters.district?.toLowerCase(),
      );
    }

    this.checkRowLimit(filtered.length);

    const columns = [
      { key: 'fullName', header: 'Name', width: 22 },
      { key: 'email', header: 'Email', width: 24 },
      { key: 'phone', header: 'Phone', width: 18 },
      { key: 'district', header: 'District', width: 16 },
      { key: 'orderCount', header: 'Total Orders', width: 14 },
      { key: 'totalSpend', header: 'Total Spend', width: 16 },
    ];

    const rows = filtered.map(c => ({
      fullName: c.fullName,
      email: ctx.canExportPii ? c.email : maskEmail(c.email),
      phone: ctx.canExportPii ? (c.phone || '') : maskPhone(c.phone),
      district: c.district || 'Unknown',
      orderCount: Number(c.orderCount),
      totalSpend: c.totalSpend,
    }));

    this.setDownloadHeaders(res, 'customers-report', filters.format);

    if (filters.format === 'csv') {
      await this.streamCsv(res, columns, rows);
    } else {
      await this.streamXlsx(res, 'Customers', columns, rows);
    }

    await this.audit.record({
      actorId: ctx.userId,
      actorType: 'USER',
      action: 'REPORT_EXPORTED',
      targetType: 'Report',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        reportType: 'CUSTOMERS',
        format: filters.format,
        rowCount: rows.length,
        filters,
      },
    });
  }

  async exportFinancial(filters: FinancialFilter, ctx: ReportContext, res: Response): Promise<void> {
    if (!ctx.canViewFinance) {
      throw AppError.forbidden('Financial report export requires analytics:view_finance permission');
    }

    const resolution = resolvePeriod(filters.period, filters.from, filters.to);

    const [salesRaw, expenseRows, refundRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          gross_sales: string | null;
          discount_total: string | null;
          cogs_sum: string | null;
        }>
      >`
        SELECT
          COALESCE(SUM(o.subtotal), 0)::text as gross_sales,
          COALESCE(SUM(o."discountTotal"), 0)::text as discount_total,
          COALESCE(SUM(items.cogs), 0)::text as cogs_sum
        FROM "Order" o
        LEFT JOIN (
          SELECT
            "orderId",
            SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" * quantity ELSE 0 END) as cogs
          FROM "OrderItem"
          GROUP BY "orderId"
        ) items ON o.id = items."orderId"
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${resolution.current.start} AND o."placedAt" < ${resolution.current.end}
      `,
      prisma.$queryRaw<Array<{ category: string; amount: string }>>`
        SELECT category::text, SUM(amount)::text as amount
        FROM "Expense"
        WHERE date >= ${resolution.current.start} AND date < ${resolution.current.end}
        GROUP BY category
      `,
      prisma.$queryRaw<Array<{ amount: string | null }>>`
        SELECT COALESCE(SUM(amount), 0)::text as amount
        FROM "Refund"
        WHERE status = 'COMPLETED'
          AND "completedAt" >= ${resolution.current.start} AND "completedAt" < ${resolution.current.end}
      `,
    ]);

    const grossSales = Number(salesRaw[0]?.gross_sales || '0');
    const discounts = Number(salesRaw[0]?.discount_total || '0');
    const refunds = Number(refundRows[0]?.amount || '0');
    const cogs = Number(salesRaw[0]?.cogs_sum || '0');
    const netSales = grossSales - discounts - refunds;
    const grossProfit = netSales - cogs;

    const totalExpenses = expenseRows.reduce((acc, e) => acc + Number(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    const columns = [
      { key: 'metric', header: 'Financial Metric', width: 28 },
      { key: 'amount', header: 'Amount (BDT)', width: 18 },
    ];

    const rows = [
      { metric: 'Gross Sales', amount: grossSales.toFixed(2) },
      { metric: 'Less: Order Discounts', amount: `(${discounts.toFixed(2)})` },
      { metric: 'Less: Completed Refunds', amount: `(${refunds.toFixed(2)})` },
      { metric: 'Net Sales', amount: netSales.toFixed(2) },
      { metric: 'Less: Cost of Goods Sold (COGS)', amount: `(${cogs.toFixed(2)})` },
      { metric: 'Gross Profit', amount: grossProfit.toFixed(2) },
      ...expenseRows.map(e => ({
        metric: `Expense: ${e.category}`,
        amount: `(${Number(e.amount).toFixed(2)})`,
      })),
      { metric: 'Total Operating Expenses', amount: `(${totalExpenses.toFixed(2)})` },
      { metric: 'Net Operating Profit', amount: netProfit.toFixed(2) },
    ];

    this.setDownloadHeaders(res, `financial-report-${filters.period}`, filters.format);

    if (filters.format === 'csv') {
      await this.streamCsv(res, columns, rows);
    } else if (filters.format === 'xlsx') {
      await this.streamXlsx(res, 'Financial Summary', columns, rows);
    } else {
      await this.generateSummaryPdf(res, 'Financial Statement Summary', columns, rows);
    }

    await this.audit.record({
      actorId: ctx.userId,
      actorType: 'USER',
      action: 'REPORT_EXPORTED',
      targetType: 'Report',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        reportType: 'FINANCIAL',
        format: filters.format,
        rowCount: rows.length,
        filters,
      },
    });
  }
}

export const reportsService = new ReportsService();
