import { Injectable, BadRequestException } from '@nestjs/common';

export interface ValidationOptions {
  maxSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  requireMagicNumber?: boolean;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class FileValidationService {
  // Magic numbers for common file types
  private readonly MAGIC_NUMBERS: Record<string, number[]> = {
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'application/zip': [0x50, 0x4b, 0x03, 0x04],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      0x50, 0x4b, 0x03, 0x04,
    ], // DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
      0x50, 0x4b, 0x03, 0x04,
    ], // XLSX
  };

  /**
   * Validate a file against specified options
   */
  validate(
    file: Express.Multer.File,
    options: ValidationOptions,
  ): FileValidationResult {
    const errors: string[] = [];

    // Check file size
    if (options.maxSize && file.size > options.maxSize) {
      errors.push(
        `File size ${file.size} exceeds maximum allowed size ${options.maxSize}`,
      );
    }

    // Check MIME type
    if (
      options.allowedMimeTypes &&
      !options.allowedMimeTypes.includes(file.mimetype)
    ) {
      errors.push(
        `MIME type ${file.mimetype} is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`,
      );
    }

    // Check file extension
    if (options.allowedExtensions) {
      const ext = this.getExtension(file.originalname);
      if (!options.allowedExtensions.includes(ext)) {
        errors.push(
          `File extension ${ext} is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`,
        );
      }
    }

    // Validate magic numbers (file signature)
    if (options.requireMagicNumber !== false) {
      const magicNumberValid = this.validateMagicNumber(
        file.buffer,
        file.mimetype,
      );
      if (!magicNumberValid) {
        errors.push(
          'File content does not match declared MIME type (magic number mismatch)',
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate magic numbers to prevent file type spoofing
   */
  validateMagicNumber(buffer: Buffer, mimeType: string): boolean {
    const expected = this.MAGIC_NUMBERS[mimeType];

    if (!expected) {
      // If we don't have magic numbers for this type, skip validation
      return true;
    }

    // Special case for WebP (requires additional check)
    if (mimeType === 'image/webp') {
      return this.validateWebP(buffer);
    }

    const actual = Array.from(buffer.slice(0, expected.length));
    return expected.every((byte, i) => byte === actual[i]);
  }

  /**
   * Validate WebP format (RIFF header + WEBP signature)
   */
  private validateWebP(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;

    // Check RIFF header
    const riff = buffer.slice(0, 4);
    if (riff.toString() !== 'RIFF') return false;

    // Check WEBP signature at offset 8
    const webp = buffer.slice(8, 12);
    return webp.toString() === 'WEBP';
  }

  /**
   * Get file extension from filename
   */
  private getExtension(filename: string): string {
    return filename
      .slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2)
      .toLowerCase();
  }

  /**
   * Check if file is an image
   */
  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if file is a document
   */
  isDocument(mimeType: string): boolean {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];
    return documentTypes.includes(mimeType);
  }

  /**
   * Sanitize filename to prevent path traversal and other attacks
   */
  sanitizeFilename(filename: string): string {
    // Remove path separators and null bytes
    let sanitized = filename.replace(/[\/\\:\*\?"<>\|]/g, '_');

    // Remove any leading dots
    sanitized = sanitized.replace(/^\.+/, '');

    // Limit length
    if (sanitized.length > 255) {
      const ext = this.getExtension(sanitized);
      const nameWithoutExt = sanitized.slice(0, -(ext.length + 1));
      sanitized = nameWithoutExt.slice(0, 255 - ext.length - 1) + '.' + ext;
    }

    return sanitized;
  }

  /**
   * Get human-readable file size
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
