import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiResponseDto } from './common/dto/api-response.dto';
import { StatsResponseDto } from './common/dto/stats-response.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'tomilo-lib-server',
    };
  }

  @Get('stats')
  async getStats(): Promise<ApiResponseDto<StatsResponseDto>> {
    const stats = await this.appService.getStats();
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats',
      method: 'GET',
    };
  }
}
