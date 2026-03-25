import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function createMockExecutionContext(isPublic: boolean): ExecutionContext {
  return {
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        headers: { authorization: 'Bearer token' },
      }),
    }),
  } as any;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should allow access to routes decorated with @Public()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const ctx = createMockExecutionContext(true);
    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('should call super.canActivate for non-public routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    // Spy on the parent AuthGuard canActivate
    const superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);

    const ctx = createMockExecutionContext(false);
    guard.canActivate(ctx);

    expect(superCanActivate).toHaveBeenCalledWith(ctx);
    superCanActivate.mockRestore();
  });

  it('handleRequest should return the user when no error', () => {
    const user = { id: '1', walletAddress: 'G...' };
    const result = guard.handleRequest(null, user);
    expect(result).toBe(user);
  });

  it('handleRequest should throw UnauthorizedException when user is null', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest should re-throw existing error', () => {
    const err = new UnauthorizedException('Token expired');
    expect(() => guard.handleRequest(err, null)).toThrow(err);
  });
});
