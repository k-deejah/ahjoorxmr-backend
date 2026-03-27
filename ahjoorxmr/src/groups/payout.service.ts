import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../groups/entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { StellarService } from '../stellar/stellar.service';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly stellarService: StellarService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Distributes payout for a given group and round.
   * Finds the member whose payoutOrder matches the round (0-indexed).
   * Invokes the Soroban contract's payout method.
   * On success, updates membership and emits notification.
   */
  async distributePayout(groupId: string, round: number): Promise<string> {
    this.logger.log(`Starting payout distribution for group ${groupId}, round ${round}`);

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.status !== GroupStatus.ACTIVE) {
      throw new BadRequestException('Group must be ACTIVE to distribute payout');
    }

    if (!group.contractAddress) {
      throw new BadRequestException('Group has no contract address');
    }

    // payoutOrder is 0-indexed, round is 1-indexed
    const expectedPayoutOrder = round - 1;

    const recipient = await this.membershipRepository.findOne({
      where: { groupId, payoutOrder: expectedPayoutOrder },
    });

    if (!recipient) {
      throw new NotFoundException(
        `No member scheduled for payout in round ${round} (payoutOrder ${expectedPayoutOrder})`,
      );
    }

    if (recipient.hasReceivedPayout) {
      this.logger.warn(`Member ${recipient.userId} has already received payout for group ${groupId}`);
      throw new ConflictException('Member has already received payout');
    }

    this.logger.log(
      `Disbursing payout to ${recipient.walletAddress} (User: ${recipient.userId}) for group ${groupId}, round ${round}`,
    );

    let txHash: string;
    try {
      txHash = await this.stellarService.disbursePayout(
        group.contractAddress,
        recipient.walletAddress,
        group.contributionAmount,
      );
    } catch (error) {
      this.logger.error(
        `Failed to disburse payout for group ${groupId}, round ${round}: ${error.message}`,
        error.stack,
      );
      // Requirement: Failed contract invocation returns a 502 to the caller.
      throw new BadGatewayException(`Contract invocation failed: ${error.message}`);
    }

    // On success, set membership.hasReceivedPayout = true and record transaction hash
    recipient.hasReceivedPayout = true;
    recipient.transactionHash = txHash;
    await this.membershipRepository.save(recipient);

    this.logger.log(
      `Payout successful for group ${groupId}, round ${round}. TxHash: ${txHash}`,
    );

    // Emit a PAYOUT_RECEIVED notification to the recipient with the transaction hash
    try {
      await this.notificationsService.notify({
        userId: recipient.userId,
        type: NotificationType.PAYOUT_RECEIVED,
        title: 'Payout Received',
        body: `You have received your payout for round ${round} in group "${group.name}".`,
        metadata: {
          groupId: group.id,
          round,
          transactionHash: txHash,
          amount: group.contributionAmount,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send PAYOUT_RECEIVED notification to user ${recipient.userId}: ${error.message}`,
      );
      // Don't fail the whole process if notification fails
    }

    return txHash;
  }
}
