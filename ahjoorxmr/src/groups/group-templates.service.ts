import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GroupTemplate, GroupTemplateConfig } from './entities/group-template.entity';
import { CreateGroupTemplateDto, UpdateGroupTemplateDto } from './dto/group-template.dto';
import { Group } from './entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateGroupDto } from './dto/create-group.dto';

/**
 * Service for managing group configuration templates.
 * Enables admins to save, share, and reuse group settings.
 */
@Injectable()
export class GroupTemplatesService {
  constructor(
    @InjectRepository(GroupTemplate)
    private readonly templateRepository: Repository<GroupTemplate>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly logger: WinstonLogger,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a new group template from scratch or cloned from an existing group.
   *
   * @param createDto - Template creation data
   * @param userId - UUID of the authenticated user (template owner)
   * @returns The created GroupTemplate entity
   * @throws BadRequestException if fromGroupId is provided but group not found
   */
  async createTemplate(
    createDto: CreateGroupTemplateDto,
    userId: string,
  ): Promise<GroupTemplate> {
    this.logger.log(
      `Creating group template "${createDto.name}" for user ${userId}`,
      'GroupTemplatesService',
    );

    try {
      let config: GroupTemplateConfig;

      // If cloning from existing group, extract its config
      if (createDto.fromGroupId) {
        const sourceGroup = await this.groupRepository.findOne({
          where: { id: createDto.fromGroupId },
        });

        if (!sourceGroup) {
          throw new BadRequestException(
            `Source group ${createDto.fromGroupId} not found`,
          );
        }

        config = this.extractGroupConfig(sourceGroup);
      } else if (createDto.config) {
        config = createDto.config as any;
      } else {
        throw new BadRequestException(
          'Either config or fromGroupId must be provided',
        );
      }

      const template = this.templateRepository.create({
        name: createDto.name,
        description: createDto.description ?? null,
        isPublic: createDto.isPublic ?? false,
        config,
        ownerId: userId,
        usageCount: 0,
      });

      const saved = await this.templateRepository.save(template);

      this.logger.log(
        `Group template created with id ${saved.id} for user ${userId}`,
        'GroupTemplatesService',
      );

      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to create group template for user ${userId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Returns paginated list of templates.
   * User sees: their own private templates + all public templates.
   *
   * @param userId - UUID of the authenticated user
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @param search - Optional search string to filter by name/description
   * @returns Paginated result with templates
   */
  async findTemplates(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ data: GroupTemplate[]; total: number; page: number; limit: number }> {
    this.logger.log(
      `Fetching templates for user ${userId} page=${page} limit=${limit} search=${search}`,
      'GroupTemplatesService',
    );

    try {
      const skip = (page - 1) * limit;

      const qb = this.templateRepository
        .createQueryBuilder('template')
        .where('(template.ownerId = :userId OR template.isPublic = true)', {
          userId,
        })
        .orderBy('template.createdAt', 'DESC')
        .skip(skip)
        .take(limit);

      // Apply search filter if provided
      if (search) {
        qb.andWhere(
          '(template.name ILIKE :search OR template.description ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      const [data, total] = await qb.getManyAndCount();

      this.logger.log(
        `Found ${total} template(s) for user ${userId}; returning page ${page}`,
        'GroupTemplatesService',
      );

      return { data, total, page, limit };
    } catch (error) {
      this.logger.error(
        `Failed to fetch templates for user ${userId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Returns a single template if visible to the user.
   * A template is visible if: user is the owner OR template is public.
   *
   * @param templateId - UUID of the template
   * @param userId - UUID of the authenticated user
   * @returns The GroupTemplate entity
   * @throws NotFoundException if template not found or not visible
   */
  async findTemplateById(templateId: string, userId: string): Promise<GroupTemplate> {
    this.logger.log(
      `Fetching template ${templateId} for user ${userId}`,
      'GroupTemplatesService',
    );

    try {
      const template = await this.templateRepository.findOne({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      // Check visibility: owner can see their own, others can only see public
      if (template.ownerId !== userId && !template.isPublic) {
        throw new ForbiddenException(
          'You do not have permission to view this template',
        );
      }

      return template;
    } catch (error) {
      this.logger.error(
        `Failed to fetch template ${templateId} for user ${userId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Updates an existing template.
   * Only the owner can update their own templates.
   *
   * @param templateId - UUID of the template
   * @param updateDto - Partial template update data
   * @param userId - UUID of the authenticated user
   * @returns The updated GroupTemplate entity
   * @throws NotFoundException if template not found
   * @throws ForbiddenException if user is not the owner
   */
  async updateTemplate(
    templateId: string,
    updateDto: UpdateGroupTemplateDto,
    userId: string,
  ): Promise<GroupTemplate> {
    this.logger.log(
      `Updating template ${templateId} by user ${userId}`,
      'GroupTemplatesService',
    );

    try {
      const template = await this.templateRepository.findOne({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      if (template.ownerId !== userId) {
        throw new ForbiddenException('You can only update your own templates');
      }

      // Update fields if provided
      if (updateDto.name !== undefined) {
        template.name = updateDto.name;
      }
      if (updateDto.description !== undefined) {
        template.description = updateDto.description;
      }
      if (updateDto.isPublic !== undefined) {
        template.isPublic = updateDto.isPublic;
      }
      if (updateDto.config !== undefined) {
        // Merge partial config updates
        template.config = { ...template.config, ...updateDto.config };
      }

      const updated = await this.templateRepository.save(template);

      this.logger.log(
        `Template ${templateId} updated by user ${userId}`,
        'GroupTemplatesService',
      );

      return updated;
    } catch (error) {
      this.logger.error(
        `Failed to update template ${templateId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Soft-deletes a template.
   * Only the owner can delete their own templates.
   * Deleting a template does not affect groups created from it.
   *
   * @param templateId - UUID of the template
   * @param userId - UUID of the authenticated user
   * @throws NotFoundException if template not found
   * @throws ForbiddenException if user is not the owner
   */
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    this.logger.log(
      `Deleting template ${templateId} by user ${userId}`,
      'GroupTemplatesService',
    );

    try {
      const template = await this.templateRepository.findOne({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      if (template.ownerId !== userId) {
        throw new ForbiddenException('You can only delete your own templates');
      }

      await this.templateRepository.softRemove(template);

      this.logger.log(
        `Template ${templateId} soft-deleted by user ${userId}`,
        'GroupTemplatesService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete template ${templateId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Atomically increments the usage count of a template.
   * Called after a group is successfully created from this template.
   *
   * @param templateId - UUID of the template
   */
  async incrementUsageCount(templateId: string): Promise<void> {
    this.logger.log(`Incrementing usage count for template ${templateId}`, 'GroupTemplatesService');

    try {
      await this.templateRepository.increment(
        { id: templateId },
        'usageCount',
        1,
      );
    } catch (error) {
      this.logger.error(
        `Failed to increment usage count for template ${templateId}: ${error.message}`,
        error.stack,
        'GroupTemplatesService',
      );
      throw error;
    }
  }

  /**
   * Merges template configuration into the group creation DTO.
   * Explicit DTO fields always override template defaults.
   *
   * @param template - The GroupTemplate entity
   * @param createGroupDto - The incoming group creation DTO
   * @returns Merged CreateGroupDto with template defaults applied
   */
  mergeTemplateConfig(
    template: GroupTemplate,
    createGroupDto: CreateGroupDto,
  ): CreateGroupDto {
    const merged = { ...createGroupDto };

    // Apply template defaults only if not explicitly provided in DTO
    if (!createGroupDto.contributionAmount) {
      merged.contributionAmount = template.config.contributionAmount;
    }
    if (!createGroupDto.roundDuration) {
      merged.roundDuration = template.config.roundDuration;
    }
    if (!createGroupDto.totalRounds) {
      merged.totalRounds = template.config.totalRounds;
    }
    if (!createGroupDto.maxMembers) {
      merged.maxMembers = template.config.maxMembers;
    }
    if (!createGroupDto.minMembers) {
      merged.minMembers = template.config.minMembers;
    }
    if (!createGroupDto.assetCode && template.config.assetCode) {
      merged.assetCode = template.config.assetCode;
    }
    if (!createGroupDto.assetIssuer && template.config.assetIssuer) {
      merged.assetIssuer = template.config.assetIssuer;
    }
    if (!createGroupDto.payoutOrderStrategy && template.config.payoutOrderStrategy) {
      merged.payoutOrderStrategy = template.config.payoutOrderStrategy;
    }
    if (!createGroupDto.penaltyRate && template.config.penaltyRate) {
      merged.penaltyRate = template.config.penaltyRate;
    }
    if (!createGroupDto.gracePeriodHours && template.config.gracePeriodHours) {
      merged.gracePeriodHours = template.config.gracePeriodHours;
    }
    if (!createGroupDto.timezone && template.config.timezone) {
      merged.timezone = template.config.timezone;
    }

    return merged;
  }

  /**
   * Extracts configuration from an existing group into template-compatible format.
   *
   * @param group - The Group entity
   * @returns GroupTemplateConfig object
   */
  private extractGroupConfig(group: Group): GroupTemplateConfig {
    return {
      contributionAmount: group.contributionAmount,
      roundDuration: group.roundDuration,
      totalRounds: group.totalRounds,
      maxMembers: group.maxMembers,
      minMembers: group.minMembers,
      assetCode: group.assetCode,
      assetIssuer: group.assetIssuer,
      payoutOrderStrategy: group.payoutOrderStrategy,
      penaltyRate: Number(group.penaltyRate),
      gracePeriodHours: group.gracePeriodHours,
      timezone: group.timezone,
    };
  }
}
