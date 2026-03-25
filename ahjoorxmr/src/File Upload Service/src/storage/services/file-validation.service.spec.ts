import { FileValidationService } from './file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(() => {
    service = new FileValidationService();
  });

  describe('validate', () => {
    it('should validate a correct image file', () => {
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

      const result = service.validate(mockFile, {
        maxSize: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        allowedExtensions: ['jpg', 'jpeg', 'png'],
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject file exceeding size limit', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'large.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 15 * 1024 * 1024,
        buffer: Buffer.alloc(100),
        stream: null,
        destination: '',
        filename: '',
        path: '',
      };

      const result = service.validate(mockFile, {
        maxSize: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg'],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds maximum allowed size');
    });

    it('should reject invalid MIME type', () => {
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

      const result = service.validate(mockFile, {
        maxSize: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('MIME type');
    });

    it('should reject invalid file extension', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.exe',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        stream: null,
        destination: '',
        filename: '',
        path: '',
      };

      const result = service.validate(mockFile, {
        allowedExtensions: ['jpg', 'jpeg', 'png'],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('extension');
    });
  });

  describe('validateMagicNumber', () => {
    it('should validate JPEG magic number', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const result = service.validateMagicNumber(buffer, 'image/jpeg');
      expect(result).toBe(true);
    });

    it('should validate PNG magic number', () => {
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const result = service.validateMagicNumber(buffer, 'image/png');
      expect(result).toBe(true);
    });

    it('should validate PDF magic number', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = service.validateMagicNumber(buffer, 'application/pdf');
      expect(result).toBe(true);
    });

    it('should reject mismatched magic number', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = service.validateMagicNumber(buffer, 'image/jpeg');
      expect(result).toBe(false);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path separators', () => {
      const result = service.sanitizeFilename('../../etc/passwd');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
    });

    it('should remove special characters', () => {
      const result = service.sanitizeFilename('test:file<>name?.txt');
      expect(result).toBe('test_file__name_.txt');
    });

    it('should remove leading dots', () => {
      const result = service.sanitizeFilename('...test.txt');
      expect(result).toBe('test.txt');
    });

    it('should limit length', () => {
      const longname = 'a'.repeat(300) + '.txt';
      const result = service.sanitizeFilename(longname);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe('isImage', () => {
    it('should identify image MIME types', () => {
      expect(service.isImage('image/jpeg')).toBe(true);
      expect(service.isImage('image/png')).toBe(true);
      expect(service.isImage('image/webp')).toBe(true);
    });

    it('should reject non-image MIME types', () => {
      expect(service.isImage('application/pdf')).toBe(false);
      expect(service.isImage('text/plain')).toBe(false);
    });
  });

  describe('isDocument', () => {
    it('should identify document MIME types', () => {
      expect(service.isDocument('application/pdf')).toBe(true);
      expect(service.isDocument('application/msword')).toBe(true);
    });

    it('should reject non-document MIME types', () => {
      expect(service.isDocument('image/jpeg')).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(service.formatFileSize(0)).toBe('0 Bytes');
      expect(service.formatFileSize(1024)).toBe('1 KB');
      expect(service.formatFileSize(1048576)).toBe('1 MB');
      expect(service.formatFileSize(1073741824)).toBe('1 GB');
    });
  });
});
