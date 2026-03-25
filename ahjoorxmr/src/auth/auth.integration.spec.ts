import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

describe('Auth Integration Tests - Token Rotation & Revocation', () => {
    let app: INestApplication;
    let authService: AuthService;
    let usersService: UsersService;
    let testUser: User;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            providers: [AuthService, UsersService],
        }).compile();

        authService = moduleFixture.get<AuthService>(AuthService);
        usersService = moduleFixture.get<UsersService>(UsersService);
    });

    beforeEach(async () => {
        // Create a test user
        testUser = await usersService.create({
            email: 'test@example.com',
            password: 'hashedPassword',
            firstName: 'Test',
            lastName: 'User',
            walletAddress: `test-${Date.now()}`,
            role: 'user',
            tokenVersion: 0,
        });
    });

    describe('Token Rotation', () => {
        it('should increment tokenVersion on successful refresh', async () => {
            const initialVersion = testUser.tokenVersion;

            // Login to get initial tokens
            const loginTokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, loginTokens.refreshToken);

            // Refresh tokens
            const refreshedTokens = await authService.refreshTokens(
                testUser.id,
                loginTokens.refreshToken,
            );

            // Verify tokenVersion was incremented
            const updatedUser = await usersService.findById(testUser.id);
            expect(updatedUser.tokenVersion).toBe(initialVersion + 1);
        });

        it('should include tokenVersion in JWT payload', async () => {
            const tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
                5,
            );

            const decoded = await authService.verifyRefreshToken(tokens.refreshToken);
            expect(decoded.tokenVersion).toBe(5);
        });

        it('old refresh token should be rejected after rotation', async () => {
            // Generate initial tokens
            const initialTokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, initialTokens.refreshToken);

            // Refresh to get new tokens
            const newTokens = await authService.refreshTokens(
                testUser.id,
                initialTokens.refreshToken,
            );

            // Try to use old refresh token - should fail
            await expect(
                authService.refreshTokens(testUser.id, initialTokens.refreshToken),
            ).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('Token Theft Detection', () => {
        it('should detect token reuse and revoke all sessions', async () => {
            // Generate initial tokens
            const initialTokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, initialTokens.refreshToken);

            // Legitimate user refreshes
            const legitimateTokens = await authService.refreshTokens(
                testUser.id,
                initialTokens.refreshToken,
            );

            // Attacker tries to use old token
            await expect(
                authService.refreshTokens(testUser.id, initialTokens.refreshToken),
            ).rejects.toThrow(UnauthorizedException);

            // Verify all sessions are revoked
            const user = await usersService.findById(testUser.id);
            expect(user.refreshTokenHash).toBeNull();
        });

        it('should reject tokens with mismatched tokenVersion', async () => {
            const tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
                1,
            );

            // Manually increment tokenVersion to simulate revocation
            await usersService.incrementTokenVersion(testUser.id);

            // Verify token with old version should fail
            const decoded = await authService.verifyRefreshToken(tokens.refreshToken);
            const user = await usersService.findById(testUser.id);

            expect(decoded.tokenVersion).not.toBe(user.tokenVersion);
        });
    });

    describe('Logout Functionality', () => {
        it('should clear refreshTokenHash on logout', async () => {
            // Generate and store tokens
            const tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, tokens.refreshToken);

            let user = await usersService.findById(testUser.id);
            expect(user.refreshTokenHash).not.toBeNull();

            // Logout
            await authService.logout(testUser.id);

            // Verify token is cleared
            user = await usersService.findById(testUser.id);
            expect(user.refreshTokenHash).toBeNull();
        });

        it('should increment tokenVersion on logout', async () => {
            const initialVersion = testUser.tokenVersion;

            await authService.logout(testUser.id);

            const user = await usersService.findById(testUser.id);
            expect(user.tokenVersion).toBe(initialVersion + 1);
        });

        it('should invalidate all active sessions on logout', async () => {
            // Generate tokens
            const tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, tokens.refreshToken);

            // Logout
            await authService.logout(testUser.id);

            // Try to refresh - should fail
            await expect(
                authService.refreshTokens(testUser.id, tokens.refreshToken),
            ).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('Token Version Mismatch', () => {
        it('should return 401 when tokenVersion does not match', async () => {
            // Create token with version 0
            const tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
                0,
            );

            // Increment version to simulate revocation
            await usersService.incrementTokenVersion(testUser.id);

            // Decode token to verify version mismatch
            const decoded = await authService.verifyRefreshToken(tokens.refreshToken);
            const user = await usersService.findById(testUser.id);

            expect(decoded.tokenVersion).toBe(0);
            expect(user.tokenVersion).toBe(1);
        });
    });

    describe('Multiple Refresh Cycles', () => {
        it('should handle multiple refresh cycles correctly', async () => {
            let tokens = await authService.generateTokens(
                testUser.id,
                testUser.email || '',
                testUser.role,
            );
            await authService.updateRefreshToken(testUser.id, tokens.refreshToken);

            const versions: number[] = [];

            for (let i = 0; i < 3; i++) {
                tokens = await authService.refreshTokens(testUser.id, tokens.refreshToken);
                const decoded = await authService.verifyRefreshToken(tokens.refreshToken);
                versions.push(decoded.tokenVersion);
            }

            // Verify versions are incrementing
            expect(versions[0]).toBe(1);
            expect(versions[1]).toBe(2);
            expect(versions[2]).toBe(3);
        });
    });
});
