import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Stellar Address Validation (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                transform: true,
                whitelist: true,
                forbidNonWhitelisted: true,
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /api/v1/auth/challenge - Stellar Address Validation', () => {
        it('should accept valid Stellar public key', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB',
                });

            expect(response.status).not.toBe(400);
            expect(response.body.message).not.toContain('Invalid Stellar address');
        });

        it('should reject invalid checksum with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFX',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
        });

        it('should reject non-Stellar string with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: 'not-a-stellar-address',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
        });

        it('should reject secret key format with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: 'SBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
        });

        it('should reject empty string with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: '',
                });

            expect(response.status).toBe(400);
        });

        it('should not leak stack traces in error response', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/challenge')
                .send({
                    walletAddress: 'invalid-address',
                });

            expect(response.status).toBe(400);
            expect(response.body.stack).toBeUndefined();
            expect(response.body.message).not.toContain('at ');
        });
    });

    describe('POST /api/v1/auth/verify - Stellar Address Validation', () => {
        it('should accept valid Stellar public key', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/verify')
                .send({
                    walletAddress: 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB',
                    signature: 'test-signature',
                    challenge: 'test-challenge',
                });

            expect(response.status).not.toBe(400);
            expect(response.body.message).not.toContain('Invalid Stellar address');
        });

        it('should reject invalid checksum with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/verify')
                .send({
                    walletAddress: 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFX',
                    signature: 'test-signature',
                    challenge: 'test-challenge',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
        });

        it('should reject malformed address with clear error message', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/verify')
                .send({
                    walletAddress: 'malformed-address',
                    signature: 'test-signature',
                    challenge: 'test-challenge',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
            expect(response.body.message).toContain('G[A-Z2-7]{55}');
        });
    });

    describe('POST /api/v1/auth/wallet/register - Stellar Address Validation', () => {
        it('should accept valid Stellar public key', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/wallet/register')
                .send({
                    walletAddress: 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB',
                    signature: 'test-signature',
                    challenge: 'test-challenge',
                });

            expect(response.status).not.toBe(400);
            expect(response.body.message).not.toContain('Invalid Stellar address');
        });

        it('should reject invalid address with 400', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/wallet/register')
                .send({
                    walletAddress: 'invalid-address',
                    signature: 'test-signature',
                    challenge: 'test-challenge',
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid Stellar address format');
        });
    });
});
