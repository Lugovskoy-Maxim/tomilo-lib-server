import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportType } from '../schemas/report.schema';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

@Controller('reports')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createReportDto: CreateReportDto,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.reportsService.create(
        createReportDto,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: 'Report submitted successfully',
        timestamp: new Date().toISOString(),
        path: 'reports',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit report',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'reports',
        method: 'POST',
      };
    }
  }

  @Get()
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('reportType') reportType?: ReportType,
    @Query('isResolved') isResolved?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const isResolvedBool =
        isResolved === 'true'
          ? true
          : isResolved === 'false'
            ? false
            : undefined;

      const data = await this.reportsService.findAll(
        Number(page),
        Number(limit),
        reportType,
        isResolvedBool,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'reports',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reports',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'reports',
      };
    }
  }

  @Get(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findOne(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.reportsService.findOne(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `reports/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch report',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `reports/${id}`,
      };
    }
  }

  @Put(':id/status')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateReportStatusDto: UpdateReportStatusDto,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const { isResolved, resolutionMessage } = updateReportStatusDto;
      const data = await this.reportsService.updateStatus(
        id,
        isResolved,
        req.user.userId,
        resolutionMessage,
      );

      return {
        success: true,
        data,
        message: `Report ${isResolved ? 'resolved' : 'reopened'} successfully`,
        timestamp: new Date().toISOString(),
        path: `reports/${id}/status`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update report status',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `reports/${id}/status`,
        method: 'PUT',
      };
    }
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    try {
      await this.reportsService.delete(id);

      return {
        success: true,
        message: 'Report deleted successfully',
        timestamp: new Date().toISOString(),
        path: `reports/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete report',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `reports/${id}`,
        method: 'DELETE',
      };
    }
  }
}
