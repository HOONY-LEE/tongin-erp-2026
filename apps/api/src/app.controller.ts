import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tongin/shared';

@Controller()
export class AppController {
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'tongin-api',
      timestamp: new Date().toISOString(),
    };
  }
}
