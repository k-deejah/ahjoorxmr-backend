import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly repo: Repository<ApiKey>,
    private readonly auditService: AuditService,
  ) {}

  private hash(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }

  async create(
    dto: CreateApiKeyDto,
    ownerId: string,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    const plaintext = `ak_live_${randomBytes(32).toString('hex')}`;
    const keyHash = this.hash(plaintext);

    const apiKey = this.repo.create({
      name: dto.name,
      ownerId,
      scopes: dto.scopes ?? [],
      keyHash,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      revokedAt: null,
      lastUsedAt: null,
    });

    await this.repo.save(apiKey);
    return { key: plaintext, apiKey };
  }

  async findAllForAdmin(): Promise<ApiKey[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findAllForUser(ownerId: string): Promise<ApiKey[]> {
    return this.repo.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
  }

  async revoke(id: string): Promise<void> {
    const key = await this.repo.findOne({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    key.revokedAt = new Date();
    await this.repo.save(key);
  }

  async validateAndTouch(
    plaintext: string,
    request: { ip?: string },
  ): Promise<ApiKey> {
    const keyHash = this.hash(plaintext);
    const apiKey = await this.repo.findOne({ where: { keyHash } });

    if (!apiKey) throw new UnauthorizedException('Invalid API key');
    if (apiKey.revokedAt) throw new UnauthorizedException('API key revoked');
    if (apiKey.expiresAt && apiKey.expiresAt < new Date())
      throw new UnauthorizedException('API key expired');

    // Update lastUsedAt without blocking the request
    this.repo.update(apiKey.id, { lastUsedAt: new Date() }).catch(() => null);

    // Audit log — fire and forget
    this.auditService
      .createLog({
        action: 'API_KEY_REQUEST',
        resource: 'API_KEY',
        userId: apiKey.ownerId,
        metadata: { apiKeyId: apiKey.id, scopes: apiKey.scopes },
        ipAddress: request.ip,
      })
      .catch(() => null);

    return apiKey;
  }
}
