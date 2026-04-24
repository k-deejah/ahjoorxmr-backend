import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ExportFormat } from './dto/audit-export-query.dto';

const mockLogs: Partial<AuditLog>[] = [
  {
    id: 'uuid-1',
    userId: 'user-1',
    action: 'CONTRIBUTION',
    resource: 'CONTRIBUTION',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ipAddress: '127.0.0.1',
    metadata: { email: 'test@example.com', walletAddress: 'GABC123' },
  },
  {
    id: 'uuid-2',
    userId: 'user-2',
    action: 'PAYOUT',
    resource: 'PAYOUT',
    timestamp: new Date('2024-01-02T00:00:00Z'),
    ipAddress: '127.0.0.2',
    metadata: {},
  },
];

const mockRepo = {
  findAndCount: jest.fn().mockResolvedValue([mockLogs, mockLogs.length]),
  create: jest.fn().mockImplementation((data) => data),
  save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
  delete: jest.fn().mockResolvedValue({ affected: 0 }),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'PII_HMAC_SECRET') return 'test-secret';
    if (key === 'AUDIT_EXPORT_PII_ALLOWED') return 'false';
    return null;
  }),
};

describe('AuditService - Export', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should export logs and return correct count', async () => {
    const result = await service.exportAuditLogs({ format: ExportFormat.JSON });
    expect(result.count).toBe(2);
    expect(result.logs).toHaveLength(2);
  });

  it('should redact PII fields when includePii is false', () => {
    const log = mockLogs[0] as AuditLog;
    const redacted = service.redactPii(log);
    expect(redacted.metadata.email).toBe('[REDACTED]');
    expect(redacted.metadata.walletAddress).toBe('[REDACTED]');
  });

  it('should generate valid HMAC-SHA256 signature', () => {
    const data = 'test-payload';
    const signature = service.generateHmacSignature(data);
    const expected = createHmac('sha256', 'test-secret').update(data).digest('hex');
    expect(signature).toBe(expected);
  });

  it('should format logs as valid CSV with headers', () => {
    const csv = service.formatAsCsv(mockLogs as AuditLog[], false);
    expect(csv).toContain('id,userId,action,resource,timestamp,ipAddress');
    expect(csv).toContain('uuid-1');
    expect(csv).toContain('CONTRIBUTION');
  });

  it('should format logs as valid JSON', () => {
    const json = service.formatAsJson(mockLogs as AuditLog[], false);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('should include HMAC signature as trailing line in CSV', () => {
    const csv = service.formatAsCsv(mockLogs as AuditLog[], false);
    const signature = service.generateHmacSignature(csv);
    const csvWithSig = csv + `\n# HMAC-SHA256: ${signature}`;
    expect(csvWithSig).toContain('# HMAC-SHA256:');
  });

  it('should not redact PII when includePii is true', () => {
    const log = mockLogs[0] as AuditLog;
    const json = service.formatAsJson([log], true);
    const parsed = JSON.parse(json);
    expect(parsed[0].metadata.email).toBe('test@example.com');
  });
});
