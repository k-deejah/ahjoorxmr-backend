# File Upload Service - Implementation Guide

## Overview

This document provides a comprehensive guide for implementing and using the file upload service in your NestJS application.

## Architecture

### Design Patterns

1. **Adapter Pattern**: Flexible storage backend switching (S3, Local, easily extensible)
2. **Service Layer Pattern**: Separation of concerns with dedicated services
3. **Dependency Injection**: Full use of NestJS DI container

### Component Structure

```
File Upload Service
│
├── Adapters Layer
│   ├── StorageAdapter Interface
│   ├── S3StorageAdapter
│   └── LocalStorageAdapter
│
├── Services Layer
│   ├── ImageCompressionService
│   └── FileValidationService
│
├── Data Layer
│   └── FileMetadata Entity
│
├── API Layer
│   └── StorageController
│
└── Orchestration
    └── StorageService
```

## Installation

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp
```

### 2. Database Migration

Run the migration to create the `file_metadata` table:

```sql
CREATE TABLE file_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  uploaded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_metadata_uploaded_by ON file_metadata(uploaded_by);
CREATE INDEX idx_file_metadata_created_at ON file_metadata(created_at);
```

### 3. Configure Environment

Add to your `.env` file:

```env
STORAGE_TYPE=local  # or 's3'
LOCAL_STORAGE_PATH=./uploads
BASE_URL=http://localhost:3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket
JWT_SECRET=your-secret
```

## Integration into Main Application

### Import StorageModule

```typescript
// app.module.ts
import { StorageModule } from './File Upload Service/src/storage/storage.module';

@Module({
  imports: [
    // ... other modules
    StorageModule,
  ],
})
export class AppModule {}
```

### Use StorageService in Your Services

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from './File Upload Service/src/storage/storage.service';
import { FileType } from './File Upload Service/src/storage/dto/upload-file.dto';

@Injectable()
export class UserService {
  constructor(private storageService: StorageService) {}

  async uploadProfilePicture(file: Express.Multer.File, userId: string) {
    const metadata = await this.storageService.uploadFile(
      file,
      FileType.PROFILE_PICTURE,
      userId,
    );

    // Update user profile with new image URL
    await this.updateUserProfileImage(userId, metadata.url);

    return metadata;
  }
}
```

## Usage Examples

### Basic File Upload

```typescript
// In your controller
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(
  @UploadedFile() file: Express.Multer.File,
  @Body('userId') userId: string,
) {
  return this.storageService.uploadFile(
    file,
    FileType.DOCUMENT,
    userId,
  );
}
```

### Generate Signed URL

```typescript
// Get a signed URL valid for 1 hour
const signedUrl = await this.storageService.getSignedUrl(
  fileId,
  3600, // expires in 3600 seconds
);
```

### Delete File

```typescript
await this.storageService.deleteFile(fileId);
```

### Get User's Files

```typescript
const files = await this.storageService.getFilesByUser(userId);
```

## Advanced Features

### Custom Image Compression

The image compression service supports various options:

```typescript
import { ImageCompressionService } from './services/image-compression.service';

@Injectable()
export class CustomImageProcessor {
  constructor(private compression: ImageCompressionService) {}

  async processImage(buffer: Buffer) {
    // Compress with custom settings
    const compressed = await this.compression.compress(buffer, {
      quality: 85,
      maxWidth: 1920,
      maxHeight: 1080,
      format: 'webp',
    });

    // Generate multiple thumbnail sizes
    const thumbnails = await this.compression.generateMultipleThumbnails(
      buffer,
      [
        { width: 150, height: 150, suffix: 'small' },
        { width: 300, height: 300, suffix: 'medium' },
        { width: 600, height: 600, suffix: 'large' },
      ],
    );

    return { compressed, thumbnails };
  }
}
```

### Custom File Validation

```typescript
import { FileValidationService } from './services/file-validation.service';

const validation = this.fileValidation.validate(file, {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['image/jpeg', 'image/png'],
  allowedExtensions: ['jpg', 'jpeg', 'png'],
  requireMagicNumber: true,
});

if (!validation.isValid) {
  throw new BadRequestException(validation.errors.join('; '));
}
```

## Creating Custom Storage Adapters

To add a new storage backend (e.g., Google Cloud Storage, Azure Blob):

1. **Create adapter class**:

```typescript
import { StorageAdapter } from './storage-adapter.interface';

@Injectable()
export class GCSStorageAdapter implements StorageAdapter {
  async upload(options: UploadOptions): Promise<string> {
    // Implementation
  }

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    // Implementation
  }

  async getFileStream(key: string): Promise<Readable> {
    // Implementation
  }

  async delete(key: string): Promise<void> {
    // Implementation
  }

  async exists(key: string): Promise<boolean> {
    // Implementation
  }
}
```

2. **Register in module**:

```typescript
@Module({
  providers: [
    // ... existing providers
    GCSStorageAdapter,
  ],
})
export class StorageModule {}
```

3. **Update StorageService**:

```typescript
constructor(
  // ... existing dependencies
  private gcsAdapter: GCSStorageAdapter,
) {
  this.initializeStorageAdapter();
}

private initializeStorageAdapter(): void {
  const storageType = this.configService.get('STORAGE_TYPE');

  switch (storageType) {
    case 'gcs':
      this.storageAdapter = this.gcsAdapter;
      break;
    // ... other cases
  }
}
```

## Security Considerations

### File Upload Security Checklist

- ✅ Validate file types (MIME + magic numbers)
- ✅ Enforce file size limits
- ✅ Sanitize filenames
- ✅ Use signed URLs for sensitive files
- ✅ Strip EXIF metadata from images
- ✅ Implement rate limiting on upload endpoints
- ✅ Validate user permissions before upload
- ✅ Scan files for malware (recommended for production)

### Example: Adding Permission Check

```typescript
@Post('upload')
@UseGuards(JwtAuthGuard)
async uploadFile(
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: User,
) {
  // Check if user has upload permission
  if (!user.canUploadFiles) {
    throw new ForbiddenException('You do not have upload permissions');
  }

  return this.storageService.uploadFile(
    file,
    FileType.DOCUMENT,
    user.id,
  );
}
```

## Performance Optimization

### 1. Async Processing

For large files, process compression asynchronously:

```typescript
import { Queue } from 'bull';

@Injectable()
export class AsyncStorageService {
  constructor(
    @InjectQueue('file-processing') private fileQueue: Queue,
  ) {}

  async uploadLargeFile(file: Express.Multer.File, userId: string) {
    // Upload original file first
    const metadata = await this.storageService.uploadFile(...);

    // Queue compression job
    await this.fileQueue.add('compress', {
      fileId: metadata.id,
      storageKey: metadata.storageKey,
    });

    return metadata;
  }
}
```

### 2. CDN Integration

For S3, use CloudFront:

```typescript
async uploadFile(...) {
  const metadata = await this.storageService.uploadFile(...);

  // Replace S3 URL with CDN URL
  metadata.url = metadata.url.replace(
    'your-bucket.s3.amazonaws.com',
    'your-cdn-domain.cloudfront.net',
  );

  return metadata;
}
```

## Monitoring and Logging

The service includes comprehensive logging:

```typescript
// Enable debug logging
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', 'debug'],
});
```

Monitor these metrics:

- Upload success/failure rate
- Average upload time
- Storage space usage
- Failed validation attempts (potential attacks)

## Testing

### Unit Tests

```bash
npm run test
```

### Integration Tests

```bash
npm run test:e2e
```

### Manual Testing

```bash
# Test image upload
curl -X POST http://localhost:3000/api/v1/upload \
  -F "file=@test.jpg" \
  -F "fileType=profile_picture" \
  -F "userId=test-user"

# Test signed URL generation
curl http://localhost:3000/api/v1/upload/{fileId}/signed-url?expiresIn=3600

# Test file deletion
curl -X DELETE http://localhost:3000/api/v1/upload/{fileId}
```

## Troubleshooting

### Common Issues

1. **"Cannot upload to S3"**
   - Check AWS credentials in `.env`
   - Verify S3 bucket exists and has correct permissions
   - Check IAM policy allows `PutObject`, `GetObject`, `DeleteObject`

2. **"Magic number validation failed"**
   - File content doesn't match declared MIME type
   - Could indicate file corruption or manipulation attempt

3. **"File size exceeds limit"**
   - Adjust `MAX_FILE_SIZE` in `storage.service.ts`
   - Update `MaxFileSizeValidator` in controller

4. **"Image compression failed"**
   - Ensure `sharp` is properly installed
   - Check if file is actually a valid image

## Migration Guide

### From Old Service to New

If migrating from the old file upload implementation:

1. Update import paths:

```typescript
// Old
import { StorageService } from './storage/storage.service';

// New
import { StorageService } from './File Upload Service/src/storage/storage.service';
```

2. Update FileType enum usage (no changes needed)

3. Update environment variables (add `STORAGE_TYPE`)

4. Test all file upload flows

## Future Enhancements

Planned features:

- [ ] Video compression support
- [ ] Direct browser-to-S3 uploads
- [ ] Virus scanning integration
- [ ] Image watermarking
- [ ] Automatic format conversion
- [ ] Multi-region support
- [ ] Backup to multiple storage backends

## Support

For issues or questions:

1. Check the [README.md](README.md)
2. Review the tests for usage examples
3. Open an issue in the repository
