import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';

export interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill';
}

@Injectable()
export class ImageCompressionService {
  private readonly logger = new Logger(ImageCompressionService.name);

  /**
   * Compress an image with specified options
   */
  async compress(
    buffer: Buffer,
    options: CompressionOptions = {},
  ): Promise<Buffer> {
    const {
      quality = 80,
      maxWidth,
      maxHeight,
      format = 'jpeg',
      fit = 'inside',
    } = options;

    let image = sharp(buffer);

    // Resize if dimensions specified
    if (maxWidth || maxHeight) {
      image = image.resize(maxWidth, maxHeight, { fit });
    }

    // Apply format-specific compression
    switch (format) {
      case 'jpeg':
        image = image.jpeg({ quality, progressive: true });
        break;
      case 'png':
        image = image.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        image = image.webp({ quality });
        break;
    }

    const compressed = await image.toBuffer();
    const originalSize = buffer.length;
    const compressedSize = compressed.length;
    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(2);

    this.logger.log(
      `Image compressed: ${originalSize} -> ${compressedSize} bytes (${savings}% reduction)`,
    );

    return compressed;
  }

  /**
   * Generate a thumbnail from an image
   */
  async generateThumbnail(
    buffer: Buffer,
    options: ThumbnailOptions,
  ): Promise<Buffer> {
    const { width, height, quality = 80, fit = 'cover' } = options;

    const thumbnail = await sharp(buffer)
      .resize(width, height, {
        fit,
        position: 'center',
      })
      .jpeg({ quality })
      .toBuffer();

    this.logger.log(`Thumbnail generated: ${width}x${height}`);
    return thumbnail;
  }

  /**
   * Generate multiple thumbnail sizes
   */
  async generateMultipleThumbnails(
    buffer: Buffer,
    sizes: Array<{ width: number; height: number; suffix: string }>,
  ): Promise<Array<{ suffix: string; buffer: Buffer }>> {
    const thumbnails = await Promise.all(
      sizes.map(async (size) => ({
        suffix: size.suffix,
        buffer: await this.generateThumbnail(buffer, {
          width: size.width,
          height: size.height,
        }),
      })),
    );

    this.logger.log(`Generated ${thumbnails.length} thumbnail sizes`);
    return thumbnails;
  }

  /**
   * Get metadata from an image
   */
  async getMetadata(buffer: Buffer): Promise<sharp.Metadata> {
    return sharp(buffer).metadata();
  }

  /**
   * Check if a buffer is a valid image
   */
  async isValidImage(buffer: Buffer): Promise<boolean> {
    try {
      await sharp(buffer).metadata();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert image to WebP format for optimal web delivery
   */
  async convertToWebP(buffer: Buffer, quality: number = 80): Promise<Buffer> {
    return this.compress(buffer, { format: 'webp', quality });
  }

  /**
   * Auto-orient image based on EXIF data
   */
  async autoOrient(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).rotate().toBuffer();
  }

  /**
   * Strip metadata from image (for privacy)
   */
  async stripMetadata(buffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    const format = metadata.format;

    let image = sharp(buffer);

    switch (format) {
      case 'jpeg':
        image = image.jpeg({ quality: 90 });
        break;
      case 'png':
        image = image.png();
        break;
      case 'webp':
        image = image.webp({ quality: 90 });
        break;
    }

    return image.toBuffer();
  }
}
