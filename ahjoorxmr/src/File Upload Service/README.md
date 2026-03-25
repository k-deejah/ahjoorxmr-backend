# NestJS File Upload Service

A comprehensive file upload service with support for multiple storage backends, advanced image processing, and secure file access.

## ✨ Features

### Storage Backends

- ✅ **AWS S3** - Cloud storage with high availability
- ✅ **Local Storage** - File system based storage for development
- ✅ **Adapter Pattern** - Easy to add new storage backends

### File Processing

- ✅ **Image Compression** - Automatic compression with configurable quality
- ✅ **Thumbnail Generation** - Auto-generate thumbnails for images
- ✅ **Image Auto-Orientation** - Correct image rotation based on EXIF data
- ✅ **Metadata Stripping** - Remove sensitive EXIF data for privacy
- ✅ **Format Conversion** - Convert images to WebP for optimal delivery

### Security & Validation

- ✅ **File Type Validation** - MIME type and extension checking
- ✅ **Magic Number Validation** - Prevents file type spoofing
- ✅ **File Size Limits** - Configurable size restrictions (default: 10MB)
- ✅ **Signed URLs** - Time-limited secure file access
- ✅ **Filename Sanitization** - Prevent path traversal attacks

### Supported File Types

- **Images**: JPEG, PNG, WebP
- **Documents**: PDF, DOC, DOCX, XLS, XLSX

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file based on `.env.example`:

```bash
# Choose storage type: 's3' or 'local'
STORAGE_TYPE=local

# For S3 storage
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket

# For local storage
LOCAL_STORAGE_PATH=./uploads
BASE_URL=http://localhost:3000

# Security
JWT_SECRET=your-secret

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=fileupload
```

### Run the Service

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

## 📡 API Endpoints

### Upload File

Upload a file with automatic processing.

```http
POST /api/v1/upload
Content-Type: multipart/form-data
```

**Request Body:**

- `file` (file): File to upload
- `fileType` (string): Type - `profile_picture`, `group_image`, or `document`
- `userId` (string, optional): User identifier

**Example:**

```bash
curl -X POST http://localhost:3000/api/v1/upload \
  -F "file=@profile.jpg" \
  -F "fileType=profile_picture" \
  -F "userId=user123"
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "profile.jpg",
  "size": 245678,
  "mimeType": "image/jpeg",
  "url": "http://localhost:3000/api/v1/upload/files/1234567890-abc.jpg",
  "thumbnailUrl": "http://localhost:3000/api/v1/upload/files/thumbnails/1234567890-abc.jpg",
  "createdAt": "2026-02-25T10:30:00.000Z"
}
```

### Get Signed URL

Generate a time-limited secure URL for file access.

```http
GET /api/v1/upload/:id/signed-url?expiresIn=3600
```

**Parameters:**

- `id` (path): File ID
- `expiresIn` (query, optional): Expiration time in seconds (default: 3600)

**Example:**

```bash
curl http://localhost:3000/api/v1/upload/550e8400-e29b-41d4-a716-446655440000/signed-url?expiresIn=7200
```

**Response:**

```json
{
  "url": "http://localhost:3000/api/v1/upload/files/1234567890-abc.jpg?token=abc123&expires=1709035200000",
  "expiresIn": 7200
}
```

### Get File Metadata

Retrieve metadata for an uploaded file.

```http
GET /api/v1/upload/:id
```

**Example:**

```bash
curl http://localhost:3000/api/v1/upload/550e8400-e29b-41d4-a716-446655440000
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "1234567890-abc.jpg",
  "originalName": "profile.jpg",
  "mimeType": "image/jpeg",
  "size": 245678,
  "url": "http://localhost:3000/api/v1/upload/files/1234567890-abc.jpg",
  "thumbnailUrl": "http://localhost:3000/api/v1/upload/files/thumbnails/1234567890-abc.jpg",
  "storageKey": "1234567890-abc.jpg",
  "uploadedBy": "user123",
  "createdAt": "2026-02-25T10:30:00.000Z"
}
```

### Delete File

Delete a file from storage and database.

```http
DELETE /api/v1/upload/:id
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/v1/upload/550e8400-e29b-41d4-a716-446655440000
```

**Response:**

```json
{
  "message": "File deleted successfully"
}
```

### Get User Files

Get all files uploaded by a specific user.

```http
GET /api/v1/upload/user/:userId
```

**Example:**

```bash
curl http://localhost:3000/api/v1/upload/user/user123
```

**Response:**

```json
{
  "count": 5,
  "files": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "1234567890-abc.jpg",
      "originalName": "profile.jpg",
      "mimeType": "image/jpeg",
      "size": 245678,
      "url": "...",
      "createdAt": "2026-02-25T10:30:00.000Z"
    }
  ]
}
```

## 🔧 Advanced Configuration

### Storage Adapters

The service uses an adapter pattern for storage backends. Switch between S3 and local storage by changing the `STORAGE_TYPE` environment variable.

#### S3 Storage

```env
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket
```

**S3 Bucket Policy Example:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket/*"
    }
  ]
}
```

#### Local Storage

```env
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./uploads
BASE_URL=http://localhost:3000
```

### Image Compression Options

The service automatically compresses images with these defaults:

- **Max dimensions**: 2048x2048
- **Quality**: 80-85%
- **Format**: JPEG
- **Thumbnail size**: 200x200

These can be customized in the `StorageService`.

### File Size Limits

Default limit is 10MB. To change:

1. Update `MAX_FILE_SIZE` in `storage.service.ts`
2. Update `MaxFileSizeValidator` in `storage.controller.ts`

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🏗️ Architecture

### Components

```
storage/
├── adapters/               # Storage backend adapters
│   ├── storage-adapter.interface.ts
│   ├── s3-storage.adapter.ts
│   └── local-storage.adapter.ts
├── services/              # Business logic services
│   ├── image-compression.service.ts
│   └── file-validation.service.ts
├── entities/              # Database entities
│   └── file-metadata.entity.ts
├── dto/                   # Data transfer objects
│   └── upload-file.dto.ts
├── storage.controller.ts  # REST API endpoints
├── storage.service.ts     # Main service orchestration
└── storage.module.ts      # NestJS module definition
```

### Storage Adapter Interface

Create custom adapters by implementing the `StorageAdapter` interface:

```typescript
export interface StorageAdapter {
  upload(options: UploadOptions): Promise<string>;
  getSignedUrl(options: SignedUrlOptions): Promise<string>;
  getFileStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

## 🔒 Security Best Practices

1. **Always validate file types** - Both MIME type and magic numbers
2. **Use signed URLs** - For sensitive files
3. **Set appropriate CORS policies** - Restrict file access
4. **Limit file sizes** - Prevent abuse
5. **Sanitize filenames** - Prevent path traversal
6. **Strip metadata** - Remove sensitive EXIF data
7. **Use environment variables** - Never hardcode credentials

## 📊 Database Schema

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

## 🚀 Production Deployment

### Checklist

- [ ] Set `STORAGE_TYPE` to `s3` for production
- [ ] Configure proper S3 bucket permissions
- [ ] Set up CDN (CloudFront) for S3 bucket
- [ ] Enable SSL/TLS
- [ ] Configure proper CORS policies
- [ ] Set up monitoring and logging
- [ ] Implement rate limiting
- [ ] Configure backup strategy

### Environment Variables

Ensure all required environment variables are set in production:

```bash
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_S3_BUCKET=your-production-bucket
JWT_SECRET=***
DATABASE_HOST=***
DATABASE_PORT=5432
DATABASE_USER=***
DATABASE_PASSWORD=***
DATABASE_NAME=fileupload_prod
```

## 📝 License

MIT
