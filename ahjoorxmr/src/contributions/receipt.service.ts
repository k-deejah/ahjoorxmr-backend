import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import { Contribution } from './entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/entities/user.entity';
import { Response } from 'express';

const STELLAR_EXPLORER_BASE = 'https://stellar.expert/explorer/public/tx';

@Injectable()
export class ReceiptService {
  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async streamReceiptPdf(
    contributionId: string,
    requestingUserId: string,
    res: Response,
  ): Promise<void> {
    const contribution = await this.contributionRepo.findOne({
      where: { id: contributionId },
      relations: ['group'],
    });

    if (!contribution) {
      throw new NotFoundException('Contribution not found');
    }

    const requestingUser = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });

    const isOwner = contribution.userId === requestingUserId;
    const isAdmin = requestingUser?.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const membership = await this.membershipRepo.findOne({
      where: { groupId: contribution.groupId, userId: contribution.userId },
    });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${contributionId}.pdf"`,
    );

    doc.pipe(res);

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Ahjoorxmr — ROSCA Platform', { align: 'center' });
    doc
      .fontSize(13)
      .font('Helvetica')
      .text('Contribution Receipt', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // ── Helper ───────────────────────────────────────────────────────────────
    const addRow = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${label}:  `, {
        continued: true,
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(11).text(value);
      doc.moveDown(0.4);
    };

    // ── Fields ───────────────────────────────────────────────────────────────
    addRow('Contribution ID', contribution.id);
    addRow('Group Name', contribution.group?.name ?? 'N/A');
    addRow('Round Number', String(contribution.roundNumber ?? 'N/A'));
    addRow(
      'Amount',
      `${contribution.amount} ${contribution.assetCode ?? 'XLM'}`,
    );
    addRow(
      'Member Wallet',
      membership?.walletAddress ?? contribution.walletAddress ?? 'N/A',
    );
    addRow(
      'Contribution Date',
      new Date(contribution.createdAt).toUTCString(),
    );
    addRow('Status', contribution.status ?? 'N/A');

    if (contribution.transactionHash) {
      addRow('Transaction Hash', contribution.transactionHash);
      const explorerUrl = `${STELLAR_EXPLORER_BASE}/${contribution.transactionHash}`;
      doc.moveDown(0.2);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#0066cc')
        .text('View on Stellar Explorer →', { link: explorerUrl, underline: true })
        .fillColor('black');
      doc.moveDown(0.4);
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888888')
      .text(
        'This is an auto-generated receipt. Please retain it for your records.',
        { align: 'center' },
      )
      .fillColor('black');

    doc.end();
  }
}
