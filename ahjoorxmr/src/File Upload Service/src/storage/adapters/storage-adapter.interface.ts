import { Readable } from 'stream';

export interface UploadOptions {
  buffer: Buffer;
  key: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  key: string;
  expiresIn: number;
}

export interface StorageAdapter {
  /**
   * Upload a file to storage
   */
  upload(options: UploadOptions): Promise<string>;

  /**
   * Get a signed URL for secure file access
   */
  getSignedUrl(options: SignedUrlOptions): Promise<string>;

  /**
   * Get a file stream from storage
   */
  getFileStream(key: string): Promise<Readable>;

  /**
   * Delete a file from storage
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists in storage
   */
  exists(key: string): Promise<boolean>;
}
