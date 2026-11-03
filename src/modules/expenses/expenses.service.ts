import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import {
  expensesRepository,
  type IExpensesRepository,
} from './expenses.repository';
import type {
  ExpenseEntity,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilter,
} from './expenses.types';
import type Decimal from 'decimal.js';

export interface ExpenseActorContext {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export class ExpensesService {
  constructor(
    private readonly repo: IExpensesRepository = expensesRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  async create(data: CreateExpenseInput, actor: ExpenseActorContext): Promise<ExpenseEntity> {
    const expense = await this.repo.create(data);

    await this.audit.record({
      actorId: actor.id,
      actorType: 'USER',
      action: 'EXPENSE_CREATED',
      targetType: 'Expense',
      targetId: expense.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      metadata: {
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
      },
    });

    return expense;
  }

  async getById(id: string): Promise<ExpenseEntity> {
    const expense = await this.repo.findById(id);
    if (!expense) {
      throw AppError.notFound(`Expense with ID '${id}' not found`);
    }
    return expense;
  }

  async update(
    id: string,
    data: UpdateExpenseInput,
    actor: ExpenseActorContext,
  ): Promise<ExpenseEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Expense with ID '${id}' not found`);
    }

    const updated = await this.repo.update(id, data);

    await this.audit.record({
      actorId: actor.id,
      actorType: 'USER',
      action: 'EXPENSE_UPDATED',
      targetType: 'Expense',
      targetId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      metadata: {
        previousAmount: existing.amount,
        newAmount: updated.amount,
        category: updated.category,
      },
    });

    return updated;
  }

  async delete(id: string, actor: ExpenseActorContext): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Expense with ID '${id}' not found`);
    }

    await this.repo.delete(id);

    await this.audit.record({
      actorId: actor.id,
      actorType: 'USER',
      action: 'EXPENSE_DELETED',
      targetType: 'Expense',
      targetId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      metadata: {
        category: existing.category,
        amount: existing.amount,
        date: existing.date,
      },
    });
  }

  async list(filter: ExpenseFilter): Promise<{ items: ExpenseEntity[]; total: number }> {
    return this.repo.list(filter);
  }

  async getSumInRange(from: Date, to: Date): Promise<Decimal> {
    return this.repo.sumInRange(from, to);
  }
}

export const expensesService = new ExpensesService();
