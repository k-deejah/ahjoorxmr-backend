import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Query,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Version,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { UploadFileDto } from './dto/upload-file.dto';

@ApiTags('File Upload')
@Controller('upload')
@Version('1')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file' })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType:
              /(image\/jpeg|image\/png|image\/webp|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
  ) {
    const userId = uploadDto.userId || 'anonymous';
    const metadata = await this.storageService.uploadFile(
      file,
      uploadDto.fileType,
      userId,
    );

    return {
      id: metadata.id,
      filename: metadata.originalName,
      size: metadata.size,
      mimeType: metadata.mimeType,
      url: metadata.url,
      thumbnailUrl: metadata.thumbnailUrl,
      createdAt: metadata.createdAt,
    };
  }

  @Get(':id/signed-url')
  @ApiOperation({ summary: 'Get a signed URL for secure file access' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiQuery({
    name: 'expiresIn',
    description: 'URL expiration time in seconds',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Signed URL generated' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getSignedUrl(
    @Param('id') id: string,
    @Query('expiresIn') expiresIn?: number,
  ) {
    const url = await this.storageService.getSignedUrl(
      id,
      expiresIn ? parseInt(expiresIn.toString()) : 3600,
    );
    return { url, expiresIn: expiresIn || 3600 };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File metadata retrieved' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileMetadata(@Param('id') id: string) {
    return this.storageService.getFileMetadata(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Param('id') id: string) {
    await this.storageService.deleteFile(id);
    return { message: 'File deleted successfully' };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all files uploaded by a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User files retrieved' })
  async getUserFiles(@Param('userId') userId: string) {
    const files = await this.storageService.getFilesByUser(userId);
    return { count: files.length, files };
  }

  @Get('files/:key(*)')
  @ApiOperation({
    summary: 'Serve a file from local storage (local storage only)',
  })
  @ApiParam({ name: 'key', description: 'File storage key' })
  @ApiQuery({ name: 'token', description: 'Signed URL token', required: false })
  @ApiQuery({
    name: 'expires',
    description: 'Expiration timestamp',
    required: false,
  })
  async serveFile(
    @Param('key') key: string,
    @Query('token') token?: string,
    @Query('expires') expires?: string,
    @Res() res?: Response,
  ) {
    // Verify token if provided
    if (token && expires) {
      const expiresNum = parseInt(expires);
      const isValid = this.storageService.verifyLocalToken(
        key,
        token,
        expiresNum,
      );

      if (!isValid) {
        throw new BadRequestException('Invalid or expired token');
      }
    }

    try {
      const stream = await this.storageService.getFileStream(key);
      const metadata = await this.storageService.getFileMetadata(key);

      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${metadata.originalName}"`,
      );

      stream.pipe(res);
    } catch (error) {
      throw new BadRequestException('File not found or inaccessible');
    }
  }
}
