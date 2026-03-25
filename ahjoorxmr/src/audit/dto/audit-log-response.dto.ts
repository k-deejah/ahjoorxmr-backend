import { ApiProperty } from '@nestjs/swagger';
import { AuditLog } from '../entities/audit-log.entity';

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  resource: string;

  @ApiProperty()
  metadata: Record<string, any>;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  requestPayload: Record<string, any>;

  static fromEntity(entity: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.action = entity.action;
    dto.resource = entity.resource;
    dto.metadata = entity.metadata;
    dto.timestamp = entity.timestamp;
    dto.ipAddress = entity.ipAddress;
    dto.userAgent = entity.userAgent;
    dto.requestPayload = entity.requestPayload;
    return dto;
  }
}

export class PaginatedAuditLogResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
