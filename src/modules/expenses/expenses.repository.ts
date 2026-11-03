import { prisma } from '@/config/database';
import type { Prisma, Expense } from '@prisma/client';
import Decimal from 'decimal.js';
import type {
  ExpenseEntity,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilter,
} from './expenses.types';

export interface IExpensesRepository {
  create(data: CreateExpenseInput): Promise<ExpenseEntity>;
  findById(id: string): Promise<ExpenseEntity | null>;
  update(id: string, data: UpdateExpenseInput): Promise<ExpenseEntity>;
  delete(id: string): Promise<void>;
  list(filter: ExpenseFilter): Promise<{ items: ExpenseEntity[]; total: number }>;
  sumInRange(from: Date, to: Date): Promise<Decimal>;
}

export class ExpensesRepository implements IExpensesRepository {
  private format(row: Expense): ExpenseEntity {
    return {
      id: row.id,
      category: row.category,
      amount: new Decimal(row.amount.toString()).toFixed(2),
      date: row.date,
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(data: CreateExpenseInput): Promise<ExpenseEntity> {
    const row = await prisma.expense.create({
      data: {
        category: data.category,
        amount: new Decimal(data.amount).toFixed(2),
        date: new Date(data.date),
        note: data.note || null,
        createdBy: data.createdBy,
      },
    });
    return this.format(row);
  }

  async findById(id: string): Promise<ExpenseEntity | null> {
    const row = await prisma.expense.findUnique({ where: { id } });
    return row ? this.format(row) : null;
  }

  async update(id: string, data: UpdateExpenseInput): Promise<ExpenseEntity> {
    const updateData: Prisma.ExpenseUpdateInput = {};
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = new Decimal(data.amount).toFixed(2);
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.note !== undefined) updateData.note = data.note;

    const row = await prisma.expense.update({
      where: { id },
      data: updateData,
    });
    return this.format(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } });
  }

  async list(filter: ExpenseFilter): Promise<{ items: ExpenseEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};
    if (filter.category) where.category = filter.category;
    if (filter.from || filter.to) {
      where.date = {};
      if (filter.from) where.date.gte = filter.from;
      if (filter.to) where.date.lte = filter.to;
    }

    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      items: rows.map(r => this.format(r)),
      total,
    };
  }

  async sumInRange(from: Date, to: Date): Promise<Decimal> {
    const agg = await prisma.expense.aggregate({
      where: {
        date: {
          gte: from,
          lt: to,
        },
      },
      _sum: {
        amount: true,
      },
    });
    return agg._sum.amount ? new Decimal(agg._sum.amount.toString()) : new Decimal(0);
  }
}

export const expensesRepository = new ExpensesRepository();
