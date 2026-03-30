import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Authentication Rate Limiting (e2e)', () => {
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

    describe('POST /api/v1/auth/login - Rate Limiting', () => {
        it('should allow 5 login attempts within 15 minutes', async () => {
            const loginDto = {
                email: 'test@example.com',
                password: 'password123',
            };

            for (let i = 0; i < 5; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/login')
                    .send(loginDto);

                // Should not be rate limited (may be 401 for invalid credentials, but not 429)
                expect(response.status).not.toBe(429);
            }
        });

        it('should return 429 on 6th login attempt within 15 minutes', async () => {
            const loginDto = {
                email: 'test@example.com',
                password: 'password123',
            };

            // Make 6 requests
            for (let i = 0; i < 6; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/login')
                    .send(loginDto);

                if (i < 5) {
                    expect(response.status).not.toBe(429);
                } else {
                    expect(response.status).toBe(429);
                }
            }
        });

        it('should include rate limit headers in response', async () => {
            const loginDto = {
                email: 'test@example.com',
                password: 'password123',
            };

            const response = await request(app.getHttpServer())
                .post('/api/v1/auth/login')
                .send(loginDto);

            expect(response.headers['x-ratelimit-limit']).toBeDefined();
            expect(response.headers['x-ratelimit-remaining']).toBeDefined();
            expect(response.headers['x-ratelimit-reset']).toBeDefined();
        });
    });

    describe('POST /api/v1/auth/register - Rate Limiting', () => {
        it('should allow 10 registration attempts within 1 hour', async () => {
            const registerDto = {
                email: `test${Date.now()}@example.com`,
                password: 'password123',
                firstName: 'Test',
                lastName: 'User',
            };

            for (let i = 0; i < 10; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/register')
                    .send({
                        ...registerDto,
                        email: `test${Date.now() + i}@example.com`,
                    });

                expect(response.status).not.toBe(429);
            }
        });

        it('should return 429 on 11th registration attempt within 1 hour', async () => {
            const registerDto = {
                email: `test${Date.now()}@example.com`,
                password: 'password123',
                firstName: 'Test',
                lastName: 'User',
            };

            for (let i = 0; i < 11; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/register')
                    .send({
                        ...registerDto,
                        email: `test${Date.now() + i}@example.com`,
                    });

                if (i < 10) {
                    expect(response.status).not.toBe(429);
                } else {
                    expect(response.status).toBe(429);
                }
            }
        });
    });

    describe('POST /api/v1/auth/challenge - Rate Limiting', () => {
        it('should allow 20 challenge requests within 5 minutes', async () => {
            const validAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

            for (let i = 0; i < 20; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/challenge')
                    .send({ walletAddress: validAddress });

                expect(response.status).not.toBe(429);
            }
        });

        it('should return 429 on 21st challenge request within 5 minutes', async () => {
            const validAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

            for (let i = 0; i < 21; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/challenge')
                    .send({ walletAddress: validAddress });

                if (i < 20) {
                    expect(response.status).not.toBe(429);
                } else {
                    expect(response.status).toBe(429);
                }
            }
        });
    });

    describe('POST /api/v1/auth/verify - Rate Limiting', () => {
        it('should allow 20 verify attempts within 5 minutes', async () => {
            const validAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';
            const verifyDto = {
                walletAddress: validAddress,
                signature: 'invalid-signature',
                challenge: 'invalid-challenge',
            };

            for (let i = 0; i < 20; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/verify')
                    .send(verifyDto);

                expect(response.status).not.toBe(429);
            }
        });

        it('should return 429 on 21st verify attempt within 5 minutes', async () => {
            const validAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';
            const verifyDto = {
                walletAddress: validAddress,
                signature: 'invalid-signature',
                challenge: 'invalid-challenge',
            };

            for (let i = 0; i < 21; i++) {
                const response = await request(app.getHttpServer())
                    .post('/api/v1/auth/verify')
                    .send(verifyDto);

                if (i < 20) {
                    expect(response.status).not.toBe(429);
                } else {
                    expect(response.status).toBe(429);
                }
            }
        });
    });
});
