import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as path from 'path';
import { FileMetadata } from './entities/file-metadata.entity';
import { FileType } from './dto/upload-file.dto';
import { StorageAdapter } from './adapters/storage-adapter.interface';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { ImageCompressionService } from './services/image-compression.service';
import {
  FileValidationService,
  ValidationOptions,
} from './services/file-validation.service';

export enum StorageType {
  S3 = 's3',
  LOCAL = 'local',
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private storageAdapter: StorageAdapter;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];
  private readonly ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  constructor(
    @InjectRepository(FileMetadata)
    private fileMetadataRepo: Repository<FileMetadata>,
    private configService: ConfigService,
    private s3Adapter: S3StorageAdapter,
    private localAdapter: LocalStorageAdapter,
    private imageCompression: ImageCompressionService,
    private fileValidation: FileValidationService,
  ) {
    this.initializeStorageAdapter();
  }

  private initializeStorageAdapter(): void {
    const storageType = this.configService.get<StorageType>(
      'STORAGE_TYPE',
      StorageType.LOCAL,
    );

    this.storageAdapter =
      storageType === StorageType.S3 ? this.s3Adapter : this.localAdapter;

    this.logger.log(`Storage adapter initialized: ${storageType}`);
  }

  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    userId: string,
  ): Promise<FileMetadata> {
    // Validate file
    const validationOptions = this.getValidationOptions(fileType);
    const validationResult = this.fileValidation.validate(
      file,
      validationOptions,
    );

    if (!validationResult.isValid) {
      throw new BadRequestException(validationResult.errors.join('; '));
    }

    // Process file buffer (compress if image)
    let processedBuffer = file.buffer;
    let processedMimeType = file.mimetype;

    if (this.fileValidation.isImage(file.mimetype)) {
      processedBuffer = await this.processImage(file.buffer, fileType);
      processedMimeType = 'image/jpeg'; // After compression
    }

    // Generate storage key
    const storageKey = this.generateStorageKey(file.originalname);

    // Upload main file
    const url = await this.storageAdapter.upload({
      buffer: processedBuffer,
      key: storageKey,
      contentType: processedMimeType,
      metadata: {
        originalName: file.originalname,
        uploadedBy: userId,
        fileType,
      },
    });

    // Generate thumbnail if image
    let thumbnailUrl: string | null = null;
    if (
      this.fileValidation.isImage(file.mimetype) &&
      fileType === FileType.PROFILE_PICTURE
    ) {
      thumbnailUrl = await this.generateAndUploadThumbnail(
        processedBuffer,
        storageKey,
      );
    }

    // Save metadata to database
    const metadata = this.fileMetadataRepo.create({
      filename: storageKey,
      originalName: this.fileValidation.sanitizeFilename(file.originalname),
      mimeType: processedMimeType,
      size: processedBuffer.length,
      url,
      thumbnailUrl,
      storageKey,
      uploadedBy: userId,
    });

    const saved = await this.fileMetadataRepo.save(metadata);
    this.logger.log(`File uploaded successfully: ${saved.id}`);
    return saved;
  }

  private getValidationOptions(fileType: FileType): ValidationOptions {
    const isDocument = fileType === FileType.DOCUMENT;

    return {
      maxSize: this.MAX_FILE_SIZE,
      allowedMimeTypes: isDocument
        ? this.ALLOWED_DOCUMENT_TYPES
        : this.ALLOWED_IMAGE_TYPES,
      allowedExtensions: isDocument
        ? ['pdf', 'doc', 'docx', 'xls', 'xlsx']
        : ['jpg', 'jpeg', 'png', 'webp'],
      requireMagicNumber: true,
    };
  }

  private async processImage(
    buffer: Buffer,
    fileType: FileType,
  ): Promise<Buffer> {
    // Auto-orient based on EXIF
    const oriented = await this.imageCompression.autoOrient(buffer);

    // Compress image
    const quality = fileType === FileType.PROFILE_PICTURE ? 85 : 80;
    const compressed = await this.imageCompression.compress(oriented, {
      quality,
      maxWidth: 2048,
      maxHeight: 2048,
      format: 'jpeg',
    });

    return compressed;
  }

  private async generateAndUploadThumbnail(
    buffer: Buffer,
    originalKey: string,
  ): Promise<string> {
    const thumbnail = await this.imageCompression.generateThumbnail(buffer, {
      width: 200,
      height: 200,
      quality: 80,
      fit: 'cover',
    });

    const thumbnailKey = `thumbnails/${originalKey}`;
    return this.storageAdapter.upload({
      buffer: thumbnail,
      key: thumbnailKey,
      contentType: 'image/jpeg',
    });
  }

  private generateStorageKey(originalName: string): string {
    const hash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    return `${timestamp}-${hash}${ext}`;
  }

  async getSignedUrl(
    fileId: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const metadata = await this.fileMetadataRepo.findOne({
      where: { id: fileId },
    });
    if (!metadata) {
      throw new BadRequestException('File not found');
    }

    return this.storageAdapter.getSignedUrl({
      key: metadata.storageKey,
      expiresIn,
    });
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const metadata = await this.fileMetadataRepo.findOne({
      where: { id: fileId },
    });
    if (!metadata) {
      throw new BadRequestException('File not found');
    }
    return metadata;
  }

  async deleteFile(fileId: string): Promise<void> {
    const metadata = await this.fileMetadataRepo.findOne({
      where: { id: fileId },
    });
    if (!metadata) {
      throw new BadRequestException('File not found');
    }

    // Delete from storage
    await this.storageAdapter.delete(metadata.storageKey);

    // Delete thumbnail if exists
    if (metadata.thumbnailUrl) {
      const thumbnailKey = `thumbnails/${metadata.storageKey}`;
      await this.storageAdapter.delete(thumbnailKey);
    }

    // Delete from database
    await this.fileMetadataRepo.remove(metadata);
    this.logger.log(`File deleted: ${fileId}`);
  }

  async getFilesByUser(userId: string): Promise<FileMetadata[]> {
    return this.fileMetadataRepo.find({
      where: { uploadedBy: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getFileStream(fileId: string) {
    const metadata = await this.getFileMetadata(fileId);
    return this.storageAdapter.getFileStream(metadata.storageKey);
  }

  /**
   * Verify local storage signed URL token
   */
  verifyLocalToken(key: string, token: string, expires: number): boolean {
    if (this.storageAdapter instanceof LocalStorageAdapter) {
      return this.storageAdapter.verifyToken(key, token, expires);
    }
    return false;
  }
}
