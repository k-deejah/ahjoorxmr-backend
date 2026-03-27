export enum KycStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum KycEvent {
  APPROVED = 'kyc.approved',
  REJECTED = 'kyc.rejected',
}

export const KYC_ERROR_MESSAGES = {
  NOT_SUBMITTED: 'KYC verification has not been submitted. Please upload your documents first.',
  PENDING: 'KYC verification is still under review. You will be notified once approved.',
  REJECTED: 'KYC verification was rejected. Please resubmit your documents.',
  FORBIDDEN: 'KYC approval is required to perform this action.',
} as const;
