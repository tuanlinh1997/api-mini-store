import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { EnvironmentVariables } from 'src/config/environment';
import { PrismaService } from 'src/prisma/prisma.service';

const CLEANUP_JOB_NAME = 'session-cleanup';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily housekeeping of `user_sessions`: deletes rows that expired, or were revoked, more than
 * SESSION_RETENTION_DAYS ago. Idempotent, so running it twice (or on two instances) is harmless.
 */
@Injectable()
export class SessionCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SESSION_CLEANUP_ENABLED', { infer: true })) {
      this.logger.log('Scheduled session cleanup is disabled (SESSION_CLEANUP_ENABLED=false)');
      return;
    }
    const cronExpression = this.config.get('SESSION_CLEANUP_CRON', { infer: true });
    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => this.runScheduled(),
      start: true,
    });
    this.scheduler.addCronJob(CLEANUP_JOB_NAME, job);
    this.logger.log(`Scheduled session cleanup registered (cron "${cronExpression}")`);
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('cron', CLEANUP_JOB_NAME)) {
      this.scheduler.deleteCronJob(CLEANUP_JOB_NAME);
    }
  }

  /** Deletes stale sessions and returns how many rows were removed. */
  async purgeStaleSessions(now: Date = new Date()): Promise<number> {
    const retentionDays = this.config.get('SESSION_RETENTION_DAYS', { infer: true });
    const cutoff = new Date(now.getTime() - retentionDays * MILLISECONDS_PER_DAY);
    const { count } = await this.prisma.userSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return count;
  }

  private async runScheduled(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log('Session cleanup started');
    try {
      const deleted = await this.purgeStaleSessions();
      this.logger.log({ deleted, durationMs: Date.now() - startedAt }, 'Session cleanup finished');
    } catch (error) {
      this.logger.error({ err: error }, 'Session cleanup failed');
    }
  }
}
