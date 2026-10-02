import { Injectable } from '@nestjs/common';

import { storeDateStamp } from 'src/common/time/vn-time';
import { TransactionClient } from 'src/prisma/prisma.service';

const INVOICE_PREFIX = 'HD';
const PURCHASE_PREFIX = 'PN';
const STOCK_COUNT_PREFIX = 'KK';
const CUSTOMER_PREFIX = 'KH';
const DAILY_SEQUENCE_DIGITS = 4;
const CUSTOMER_SEQUENCE_DIGITS = 6;

export function formatDocumentNumber(
  prefix: string,
  stamp: string,
  sequence: number,
  digits: number,
): string {
  return `${prefix}${stamp}${String(sequence).padStart(digits, '0')}`;
}

interface SequenceRow {
  last_value: number;
}

/**
 * Concurrency-safe document numbering backed by the document_sequences table.
 * Must be called inside the caller's transaction: the row stays locked until commit,
 * so concurrent transactions get distinct, gap-free numbers (a rollback releases its number).
 */
@Injectable()
export class DocumentNumbersService {
  async nextInvoiceNo(tx: TransactionClient, now: Date): Promise<string> {
    return this.nextDaily(tx, INVOICE_PREFIX, now);
  }

  async nextPurchaseNo(tx: TransactionClient, now: Date): Promise<string> {
    return this.nextDaily(tx, PURCHASE_PREFIX, now);
  }

  async nextStockCountNo(tx: TransactionClient, now: Date): Promise<string> {
    return this.nextDaily(tx, STOCK_COUNT_PREFIX, now);
  }

  async nextCustomerCode(tx: TransactionClient): Promise<string> {
    const sequence = await this.increment(tx, CUSTOMER_PREFIX);
    return formatDocumentNumber(CUSTOMER_PREFIX, '', sequence, CUSTOMER_SEQUENCE_DIGITS);
  }

  private async nextDaily(tx: TransactionClient, prefix: string, now: Date): Promise<string> {
    const stamp = storeDateStamp(now);
    const sequence = await this.increment(tx, `${prefix}${stamp}`);
    return formatDocumentNumber(prefix, stamp, sequence, DAILY_SEQUENCE_DIGITS);
  }

  /**
   * The upsert takes the row's exclusive lock immediately (avoiding the shared->exclusive
   * deadlock of INSERT IGNORE + SELECT FOR UPDATE); the locking read then returns the new value.
   */
  private async increment(tx: TransactionClient, key: string): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO document_sequences (sequence_key, \`last_value\`) VALUES (${key}, 1)
      ON DUPLICATE KEY UPDATE \`last_value\` = \`last_value\` + 1`;
    const rows = await tx.$queryRaw<SequenceRow[]>`
      SELECT \`last_value\` FROM document_sequences WHERE sequence_key = ${key} FOR UPDATE`;
    return Number(rows[0]?.last_value);
  }
}
