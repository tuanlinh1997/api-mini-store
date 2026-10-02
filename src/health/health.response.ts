import { ApiProperty } from '@nestjs/swagger';

export class HealthResponse {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' }) status: 'ok';
  @ApiProperty({ type: String, enum: ['up'], example: 'up', description: 'SELECT 1 succeeded.' })
  database: 'up';
}
