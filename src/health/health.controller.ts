import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from 'src/common/decorators/auth.decorators';
import { ApiEnvelopedController, ApiOkEnvelope } from 'src/common/swagger/envelope.decorators';
import { PrismaService } from 'src/prisma/prisma.service';
import { HealthResponse } from './health.response';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

@ApiTags('Health')
@ApiEnvelopedController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + database reachability. Public so load balancers can probe it. */
  @Public()
  @ApiOkEnvelope({ status: 200, model: HealthResponse })
  @Get()
  async check(): Promise<HealthStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  }
}
