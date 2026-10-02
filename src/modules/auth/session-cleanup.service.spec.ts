import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { EnvironmentVariables } from 'src/config/environment';
import { PrismaService } from 'src/prisma/prisma.service';

import { SessionCleanupService } from './session-cleanup.service';

const NOW = new Date('2026-10-02T03:00:00.000Z');
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface Harness {
  service: SessionCleanupService;
  deleteMany: jest.Mock;
  scheduler: SchedulerRegistry;
}

function buildService(settings: Partial<Record<string, unknown>> = {}): Harness {
  const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
  const prisma = { userSession: { deleteMany } } as unknown as PrismaService;
  const values: Record<string, unknown> = {
    SESSION_CLEANUP_ENABLED: true,
    SESSION_CLEANUP_CRON: '0 3 * * *',
    SESSION_RETENTION_DAYS: 30,
    ...settings,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  const scheduler = new SchedulerRegistry();
  return { service: new SessionCleanupService(prisma, config, scheduler), deleteMany, scheduler };
}

describe('SessionCleanupService', () => {
  it('deletes sessions that expired or were revoked before the retention cutoff', async () => {
    const { service, deleteMany } = buildService({ SESSION_RETENTION_DAYS: 10 });
    const deleted = await service.purgeStaleSessions(NOW);

    expect(deleted).toBe(4);
    const cutoff = new Date(NOW.getTime() - 10 * MILLISECONDS_PER_DAY);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
  });

  it('uses the configured retention (default 30 days)', async () => {
    const { service, deleteMany } = buildService();
    await service.purgeStaleSessions(NOW);
    const cutoff = new Date(NOW.getTime() - 30 * MILLISECONDS_PER_DAY);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
  });

  it('registers a cron job when enabled and removes it on shutdown', () => {
    const { service, scheduler } = buildService();
    service.onApplicationBootstrap();
    expect(scheduler.doesExist('cron', 'session-cleanup')).toBe(true);
    service.onModuleDestroy();
    expect(scheduler.doesExist('cron', 'session-cleanup')).toBe(false);
  });

  it('registers nothing when SESSION_CLEANUP_ENABLED is false', () => {
    const { service, scheduler } = buildService({ SESSION_CLEANUP_ENABLED: false });
    service.onApplicationBootstrap();
    expect(scheduler.doesExist('cron', 'session-cleanup')).toBe(false);
  });
});
