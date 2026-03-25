import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { FileMetadata } from './entities/file-metadata.entity';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { ImageCompressionService } from './services/image-compression.service';
import { FileValidationService } from './services/file-validation.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([FileMetadata])],
  controllers: [StorageController],
  providers: [
    StorageService,
    S3StorageAdapter,
    LocalStorageAdapter,
    ImageCompressionService,
    FileValidationService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
