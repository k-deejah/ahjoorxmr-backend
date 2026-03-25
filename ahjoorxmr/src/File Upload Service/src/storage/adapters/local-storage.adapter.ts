import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import {
  StorageAdapter,
  UploadOptions,
  SignedUrlOptions,
} from './storage-adapter.interface';

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(LocalStorageAdapter.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>(
      'LOCAL_STORAGE_PATH',
      './uploads',
    );
    this.baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:3000',
    );
    this.ensureUploadDirExists();
  }

  private async ensureUploadDirExists(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  async upload(options: UploadOptions): Promise<string> {
    const filePath = path.join(this.uploadDir, options.key);
    const dir = path.dirname(filePath);

    // Ensure subdirectories exist
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, options.buffer);

    const url = `${this.baseUrl}/api/v1/upload/files/${options.key}`;
    this.logger.log(`File uploaded locally: ${options.key}`);
    return url;
  }

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    // For local storage, generate a time-limited token
    const expiry = Date.now() + options.expiresIn * 1000;
    const token = this.generateToken(options.key, expiry);

    const signedUrl = `${this.baseUrl}/api/v1/upload/files/${options.key}?token=${token}&expires=${expiry}`;
    this.logger.log(`Generated signed URL for: ${options.key}`);
    return signedUrl;
  }

  async getFileStream(key: string): Promise<Readable> {
    const filePath = path.join(this.uploadDir, key);

    try {
      await fs.access(filePath);
      return fsSync.createReadStream(filePath);
    } catch {
      throw new NotFoundException(`File not found: ${key}`);
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);

    try {
      await fs.unlink(filePath);
      this.logger.log(`File deleted locally: ${key}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a signed URL token
   */
  verifyToken(key: string, token: string, expires: number): boolean {
    if (Date.now() > expires) {
      return false;
    }

    const expectedToken = this.generateToken(key, expires);
    return token === expectedToken;
  }

  private generateToken(key: string, expiry: number): string {
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'default-secret',
    );
    const data = `${key}:${expiry}:${secret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
