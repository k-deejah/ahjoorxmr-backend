/**
 * INTEGRATION EXAMPLE
 * ─────────────────────────────────────────────────────────────
 * This file shows how to wire KycGuard into the three controllers
 * specified in the issue. Copy the relevant snippets into your
 * actual controller files — do NOT register this file directly.
 * ─────────────────────────────────────────────────────────────
 */

import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { KycGuard } from './kyc.guard';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// ─── Groups Controller ────────────────────────────────────────────────────────

@Controller('groups')
// @UseGuards(JwtAuthGuard)  ← your existing auth guard
export class GroupsController {
  /**
   * POST /groups
   * KycGuard ensures only APPROVED users can create a group.
   */
  @Post()
  @UseGuards(KycGuard)
  createGroup(@Body() dto: any) {
    // your existing logic
  }

  /**
   * POST /groups/:id/members
   * KycGuard ensures only APPROVED users can join a group.
   */
  @Post(':id/members')
  @UseGuards(KycGuard)
  joinGroup(@Param('id') groupId: string, @Body() dto: any) {
    // your existing logic
  }
}

// ─── Contributions Controller ─────────────────────────────────────────────────

@Controller('internal/contributions')
// @UseGuards(JwtAuthGuard)  ← your existing auth guard
export class ContributionsController {
  /**
   * POST /internal/contributions
   * KycGuard blocks unverified users from recording a contribution.
   */
  @Post()
  @UseGuards(KycGuard)
  recordContribution(@Body() dto: any) {
    // your existing logic
  }
}

/**
 * APPLYING AT CLASS LEVEL (alternative)
 * ────────────────────────────────────
 * If ALL routes in a controller require KYC, apply the guard
 * at the class level instead of per-method:
 *
 *   @UseGuards(JwtAuthGuard, KycGuard)
 *   @Controller('groups')
 *   export class GroupsController { ... }
 *
 * Use the @SkipKycCheck() decorator from kyc.guard.ts to carve
 * out individual routes that should be exempt (e.g. GET /groups).
 */
