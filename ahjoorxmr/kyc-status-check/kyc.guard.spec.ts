import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { KycGuard, SKIP_KYC_KEY } from './kyc.guard';
import { KYC_ERROR_MESSAGES, KycStatus } from './kyc.constants';

const mockUserRepository = {
  findOne: jest.fn(),
};

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

function buildContext(userPayload: Record<string, any> | null): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userPayload }),
    }),
  } as unknown as ExecutionContext;
}

describe('KycGuard', () => {
  let guard: KycGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: 'UserRepository', useValue: mockUserRepository },
      ],
    }).compile();

    guard = module.get<KycGuard>(KycGuard);
    jest.clearAllMocks();
    mockReflector.getAllAndOverride.mockReturnValue(false); // KYC enforced by default
  });

  // ─── Skip decorator ──────────────────────────────────────────────────────────

  it('passes through when @SkipKycCheck() is applied', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const ctx = buildContext(null); // no user — would fail without skip
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── No authenticated user ───────────────────────────────────────────────────

  it('throws ForbiddenException when request has no user', async () => {
    const ctx = buildContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── JWT fast-path ───────────────────────────────────────────────────────────

  it('allows request when JWT contains kycStatus = APPROVED', async () => {
    const ctx = buildContext({ sub: 'user-1', kycStatus: KycStatus.APPROVED });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockUserRepository.findOne).not.toHaveBeenCalled();
  });

  it('blocks request when JWT contains kycStatus = PENDING', async () => {
    const ctx = buildContext({ sub: 'user-1', kycStatus: KycStatus.PENDING });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(KYC_ERROR_MESSAGES.PENDING),
    );
  });

  it('blocks request when JWT contains kycStatus = REJECTED', async () => {
    const ctx = buildContext({ sub: 'user-1', kycStatus: KycStatus.REJECTED });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(KYC_ERROR_MESSAGES.REJECTED),
    );
  });

  it('blocks request when JWT contains kycStatus = NONE', async () => {
    const ctx = buildContext({ sub: 'user-1', kycStatus: KycStatus.NONE });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(KYC_ERROR_MESSAGES.NOT_SUBMITTED),
    );
  });

  // ─── DB fallback ─────────────────────────────────────────────────────────────

  it('falls back to DB when JWT has no kycStatus claim and user is APPROVED', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-2',
      kycStatus: KycStatus.APPROVED,
    });
    const ctx = buildContext({ sub: 'user-2' }); // no kycStatus in JWT
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      select: ['id', 'kycStatus'],
    });
  });

  it('throws 403 via DB fallback when user is PENDING', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-3',
      kycStatus: KycStatus.PENDING,
    });
    const ctx = buildContext({ sub: 'user-3' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(KYC_ERROR_MESSAGES.PENDING),
    );
  });

  it('throws 403 via DB fallback when user is not found', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);
    const ctx = buildContext({ sub: 'ghost-user' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── Error message granularity ───────────────────────────────────────────────

  it('returns a distinct message for each non-approved status', async () => {
    const cases: [KycStatus, string][] = [
      [KycStatus.NONE, KYC_ERROR_MESSAGES.NOT_SUBMITTED],
      [KycStatus.PENDING, KYC_ERROR_MESSAGES.PENDING],
      [KycStatus.REJECTED, KYC_ERROR_MESSAGES.REJECTED],
    ];

    for (const [status, expectedMsg] of cases) {
      const ctx = buildContext({ sub: 'user-x', kycStatus: status });
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        message: expectedMsg,
      });
    }
  });
});
