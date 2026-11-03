import type { ExpenseCategory } from '@prisma/client';

export interface ExpenseEntity {
  id: string;
  category: ExpenseCategory;
  amount: string;
  date: Date;
  note: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: string | number;
  date: Date | string;
  note?: string;
  createdBy: string;
}

export interface UpdateExpenseInput {
  category?: ExpenseCategory;
  amount?: string | number;
  date?: Date | string;
  note?: string | null;
}

export interface ExpenseFilter {
  category?: ExpenseCategory;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}
