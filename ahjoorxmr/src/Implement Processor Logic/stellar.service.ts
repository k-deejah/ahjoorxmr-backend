import { Injectable, Logger } from '@nestjs/common';

export interface GroupState {
  status: string;
  currentRound: number;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  /**
   * Fetches the current group state from the Stellar smart contract.
   * Replace the body with the real Stellar SDK / Horizon calls.
   */
  async getGroupState(
    contractAddress: string,
    chainId: number,
  ): Promise<GroupState> {
    this.logger.log(
      `Fetching group state for contract=${contractAddress} chainId=${chainId}`,
    );

    // TODO: Replace with actual Stellar SDK call
    // e.g.  const server = new StellarSdk.Server(this.rpcUrl);
    //       const result = await server.loadAccount(contractAddress);
    //       return this.parseGroupState(result);

    throw new Error('StellarService.getGroupState() not yet implemented');
  }
}
