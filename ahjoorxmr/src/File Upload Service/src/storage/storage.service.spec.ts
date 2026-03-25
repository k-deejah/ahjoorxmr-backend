import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageService, StorageType } from './storage.service';
import { FileMetadata } from './entities/file-metadata.entity';
import { FileType } from './dto/upload-file.dto';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { ImageCompressionService } from './services/image-compression.service';
import { FileValidationService } from './services/file-validation.service';

describe('StorageService', () => {
  let service: StorageService;
  let fileMetadataRepo: Repository<FileMetadata>;
  let s3Adapter: S3StorageAdapter;
  let localAdapter: LocalStorageAdapter;
  let compressionService: ImageCompressionService;
  let validationService: FileValidationService;

  const mockFileMetadata: FileMetadata = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    filename: 'test-file.jpg',
    originalName: 'test.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    url: 'http://example.com/test-file.jpg',
    thumbnailUrl: null,
    storageKey: 'test-key',
    uploadedBy: 'user123',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockFileMetadataRepo = {
      create: jest.fn().mockReturnValue(mockFileMetadata),
      save: jest.fn().mockResolvedValue(mockFileMetadata),
      findOne: jest.fn().mockResolvedValue(mockFileMetadata),
      find: jest.fn().mockResolvedValue([mockFileMetadata]),
      remove: jest.fn().mockResolvedValue(mockFileMetadata),
    };

    const mockS3Adapter = {
      upload: jest.fn().mockResolvedValue('http://example.com/file.jpg'),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('http://example.com/signed-url'),
      delete: jest.fn().mockResolvedValue(undefined),
      getFileStream: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
    };

    const mockLocalAdapter = {
      upload: jest.fn().mockResolvedValue('http://localhost:3000/file.jpg'),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('http://localhost:3000/signed-url'),
      delete: jest.fn().mockResolvedValue(undefined),
      getFileStream: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      verifyToken: jest.fn().mockReturnValue(true),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          STORAGE_TYPE: StorageType.LOCAL,
          AWS_S3_BUCKET: 'test-bucket',
          AWS_REGION: 'us-east-1',
          LOCAL_STORAGE_PATH: './uploads',
          BASE_URL: 'http://localhost:3000',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: getRepositoryToken(FileMetadata),
          useValue: mockFileMetadataRepo,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: S3StorageAdapter,
          useValue: mockS3Adapter,
        },
        {
          provide: LocalStorageAdapter,
          useValue: mockLocalAdapter,
        },
        ImageCompressionService,
        FileValidationService,
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    fileMetadataRepo = module.get<Repository<FileMetadata>>(
      getRepositoryToken(FileMetadata),
    );
    s3Adapter = module.get<S3StorageAdapter>(S3StorageAdapter);
    localAdapter = module.get<LocalStorageAdapter>(LocalStorageAdapter);
    compressionService = module.get<ImageCompressionService>(
      ImageCompressionService,
    );
    validationService = module.get<FileValidationService>(
      FileValidationService,
    );
  });

  describe('uploadFile', () => {
    it('should upload a valid image file', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        stream: null,
        destination: '',
        filename: '',
        path: '',
      };

      jest.spyOn(validationService, 'validate').mockReturnValue({
        isValid: true,
        errors: [],
      });

      jest
        .spyOn(compressionService, 'autoOrient')
        .mockResolvedValue(mockFile.buffer);
      jest
        .spyOn(compressionService, 'compress')
        .mockResolvedValue(mockFile.buffer);

      const result = await service.uploadFile(
        mockFile,
        FileType.PROFILE_PICTURE,
        'user123',
      );

      expect(result).toEqual(mockFileMetadata);
      expect(fileMetadataRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid file', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test'),
        stream: null,
        destination: '',
        filename: '',
        path: '',
      };

      jest.spyOn(validationService, 'validate').mockReturnValue({
        isValid: false,
        errors: ['Invalid file type'],
      });

      await expect(
        service.uploadFile(mockFile, FileType.PROFILE_PICTURE, 'user123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for file exceeding size limit', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'large.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11MB
        buffer: Buffer.alloc(11 * 1024 * 1024),
        stream: null,
        destination: '',
        filename: '',
        path: '',
      };

      jest.spyOn(validationService, 'validate').mockReturnValue({
        isValid: false,
        errors: [
          `File size ${mockFile.size} exceeds maximum allowed size ${10 * 1024 * 1024}`,
        ],
      });

      await expect(
        service.uploadFile(mockFile, FileType.PROFILE_PICTURE, 'user123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSignedUrl', () => {
    it('should generate a signed URL for an existing file', async () => {
      const result = await service.getSignedUrl(
        '123e4567-e89b-12d3-a456-426614174000',
        3600,
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should throw BadRequestException for non-existent file', async () => {
      jest.spyOn(fileMetadataRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.getSignedUrl('non-existent-id', 3600),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata for existing file', async () => {
      const result = await service.getFileMetadata(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toEqual(mockFileMetadata);
    });

    it('should throw BadRequestException for non-existent file', async () => {
      jest.spyOn(fileMetadataRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getFileMetadata('non-existent-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file from storage and database', async () => {
      await service.deleteFile('123e4567-e89b-12d3-a456-426614174000');

      expect(localAdapter.delete).toHaveBeenCalled();
      expect(fileMetadataRepo.remove).toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-existent file', async () => {
      jest.spyOn(fileMetadataRepo, 'findOne').mockResolvedValue(null);

      await expect(service.deleteFile('non-existent-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getFilesByUser', () => {
    it('should return all files for a given user', async () => {
      const result = await service.getFilesByUser('user123');

      expect(result).toEqual([mockFileMetadata]);
      expect(fileMetadataRepo.find).toHaveBeenCalledWith({
        where: { uploadedBy: 'user123' },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
