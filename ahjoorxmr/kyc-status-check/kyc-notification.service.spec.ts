import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycNotificationService } from './kyc-notification.service';
import { KycEvent, KycStatus } from './kyc.constants';

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('KycNotificationService', () => {
  let service: KycNotificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycNotificationService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<KycNotificationService>(KycNotificationService);
    jest.clearAllMocks();
  });

  describe('emitApproved', () => {
    it('emits kyc.approved event with correct payload', () => {
      service.emitApproved('user-1', 'Documents verified');

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      const [event, payload] = mockEventEmitter.emit.mock.calls[0];

      expect(event).toBe(KycEvent.APPROVED);
      expect(payload.userId).toBe('user-1');
      expect(payload.status).toBe(KycStatus.APPROVED);
      expect(payload.reason).toBe('Documents verified');
      expect(payload.occurredAt).toBeInstanceOf(Date);
    });

    it('emits without reason when none is provided', () => {
      service.emitApproved('user-2');
      const [, payload] = mockEventEmitter.emit.mock.calls[0];
      expect(payload.reason).toBeUndefined();
    });
  });

  describe('emitRejected', () => {
    it('emits kyc.rejected event with correct payload', () => {
      service.emitRejected('user-3', 'ID mismatch');

      const [event, payload] = mockEventEmitter.emit.mock.calls[0];
      expect(event).toBe(KycEvent.REJECTED);
      expect(payload.userId).toBe('user-3');
      expect(payload.status).toBe(KycStatus.REJECTED);
      expect(payload.reason).toBe('ID mismatch');
    });

    it('emits without reason when none is provided', () => {
      service.emitRejected('user-4');
      const [, payload] = mockEventEmitter.emit.mock.calls[0];
      expect(payload.reason).toBeUndefined();
    });
  });
});
