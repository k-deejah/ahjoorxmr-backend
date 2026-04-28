import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminGuard } from './admin.guard';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AuditService } from '../audit/audit.service';
import { CreateApiKeyDto, CreateApiKeyResponseDto, ApiKeyResponseDto } from '../api-keys/dto/api-key.dto';
import { AuditLog } from '../audit/entities/audit-log.entity';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin route manifest' })
  @ApiResponse({ status: 200, description: 'List of all admin routes' })
  manifest() {
    return {
      routes: [
        { method: 'GET',    path: '/admin',                        description: 'Admin route manifest' },
        { method: 'POST',   path: '/admin/api-keys',               description: 'Create API key' },
        { method: 'GET',    path: '/admin/api-keys',               description: 'List all API keys' },
        { method: 'DELETE', path: '/admin/api-keys/:id',           description: 'Revoke API key' },
        { method: 'POST',   path: '/admin/impersonate/:userId',    description: 'Issue impersonation token' },
        { method: 'GET',    path: '/admin/impersonation/audit',    description: 'Impersonation audit log' },
      ],
    };
  }

  // ─── API Keys ────────────────────────────────────────────────────────────

  @Post('api-keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create API key (admin)' })
  @ApiResponse({ status: 201, type: CreateApiKeyResponseDto })
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @Request() req: { user: { id?: string; userId?: string; sub?: string } },
  ): Promise<CreateApiKeyResponseDto> {
    const ownerId = req.user.id ?? req.user.userId ?? req.user.sub;
    const { key, apiKey } = await this.apiKeysService.create(dto, ownerId);
    return { key, ...this.toResponse(apiKey) };
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List all API keys (admin)' })
  @ApiResponse({ status: 200, type: [ApiKeyResponseDto] })
  async listApiKeys(): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeysService.findAllForAdmin();
    return keys.map((k) => this.toResponse(k));
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke API key (admin)' })
  @ApiResponse({ status: 204 })
  async revokeApiKey(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.apiKeysService.revoke(id);
  }

  // ─── Impersonation ───────────────────────────────────────────────────────

  /**
   * Issues a short-lived JWT scoped to another user's identity for debugging.
   * Requires IMPERSONATION_ENABLED=true environment flag.
   * The resulting token has isImpersonation:true and is rejected by
   * BlockImpersonationGuard on all write endpoints.
   */
  @Post('impersonate/:userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue impersonation token for a user (platform admin only)' })
  @ApiResponse({ status: 201, description: 'Short-lived impersonation JWT' })
  @ApiResponse({ status: 403, description: 'Impersonation disabled or invalid target' })
  async impersonateUser(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Request() req: any,
  ): Promise<{ token: string; expiresIn: number; targetUserId: string }> {
    const enabled = this.configService.get<string>('IMPERSONATION_ENABLED');
    if (enabled !== 'true') {
      throw new ForbiddenException(
        'Impersonation is disabled on this environment (set IMPERSONATION_ENABLED=true)',
      );
    }

    const adminId: string =
      req.user?.sub ?? req.user?.id ?? req.user?.userId ?? 'unknown';

    if (adminId === targetUserId) {
      throw new ForbiddenException('Admin cannot impersonate themselves');
    }

    const ttl = parseInt(
      this.configService.get<string>('IMPERSONATION_TOKEN_TTL_SECONDS') ?? '300',
      10,
    );

    const token = this.jwtService.sign(
      {
        sub: targetUserId,
        impersonatedBy: adminId,
        isImpersonation: true,
      },
      { expiresIn: ttl },
    );

    // Record in audit log for compliance
    await this.auditService.createLog({
      userId: adminId,
      action: 'IMPERSONATION_REQUEST',
      resource: 'user',
      metadata: {
        targetUserId,
        adminId,
        ttlSeconds: ttl,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });

    return { token, expiresIn: ttl, targetUserId };
  }

  /**
   * Returns the last 100 impersonation audit events for compliance review.
   */
  @Get('impersonation/audit')
  @ApiOperation({ summary: 'Get last 100 impersonation events (compliance)' })
  @ApiResponse({ status: 200, description: 'Impersonation audit log entries' })
  async getImpersonationAudit(): Promise<AuditLog[]> {
    return this.auditService.findImpersonationLogs();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toResponse(apiKey: any): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      ownerId: apiKey.ownerId,
      scopes: apiKey.scopes,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    };
  }
}
