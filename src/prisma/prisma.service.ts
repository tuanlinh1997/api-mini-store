import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { withTransactionRetry } from './transaction-retry';

export type TransactionClient = Prisma.TransactionClient;

/** Default options for interactive transactions that lock rows (checkout, receive, count). */
export const WRITE_TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Interactive write transaction that is re-run on deadlock / lock-wait timeout
   * (up to 3 attempts, then 409 TRANSACTION_CONFLICT). `operation` must be re-runnable.
   */
  async runWriteTransaction<T>(
    operation: (tx: TransactionClient) => Promise<T>,
    options: { maxWait: number; timeout: number } = WRITE_TRANSACTION_OPTIONS,
  ): Promise<T> {
    return withTransactionRetry(() => this.$transaction(operation, options));
  }
}
