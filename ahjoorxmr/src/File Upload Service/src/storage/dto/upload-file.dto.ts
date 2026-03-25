import { IsEnum, IsOptional } from 'class-validator';

export enum FileType {
  PROFILE_PICTURE = 'profile_picture',
  GROUP_IMAGE = 'group_image',
  DOCUMENT = 'document',
}

export class UploadFileDto {
  @IsEnum(FileType)
  fileType: FileType;

  @IsOptional()
  userId?: string;
}
