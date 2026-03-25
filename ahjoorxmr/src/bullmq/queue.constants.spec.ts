import {
  QUEUE_NAMES,
  JOB_NAMES,
  BACKOFF_DELAYS,
  RETRY_CONFIG,
} from '../../queue/queue.constants';
import { emailBackoffStrategy } from '../../queue/processors/email.processor';
import { eventSyncBackoffStrategy } from '../../queue/processors/event-sync.processor';
import { groupSyncBackoffStrategy } from '../../queue/processors/group-sync.processor';

describe('Queue Constants', () => {
  describe('QUEUE_NAMES', () => {
    it('should define all four queues', () => {
      expect(QUEUE_NAMES.EMAIL).toBe('email-queue');
      expect(QUEUE_NAMES.EVENT_SYNC).toBe('event-sync-queue');
      expect(QUEUE_NAMES.GROUP_SYNC).toBe('group-sync-queue');
      expect(QUEUE_NAMES.DEAD_LETTER).toBe('dead-letter-queue');
    });
  });

  describe('RETRY_CONFIG', () => {
    it('should have 3 attempts', () => {
      expect(RETRY_CONFIG.attempts).toBe(3);
    });

    it('should use custom backoff type', () => {
      expect(RETRY_CONFIG.backoff.type).toBe('custom');
    });
  });

  describe('BACKOFF_DELAYS', () => {
    it('should define delays in increasing order', () => {
      expect(BACKOFF_DELAYS[0]).toBe(1_000);
      expect(BACKOFF_DELAYS[1]).toBe(5_000);
      expect(BACKOFF_DELAYS[2]).toBe(30_000);
    });
  });
});

describe('Custom backoff strategies', () => {
  const strategies = [
    { name: 'emailBackoffStrategy', fn: emailBackoffStrategy },
    { name: 'eventSyncBackoffStrategy', fn: eventSyncBackoffStrategy },
    { name: 'groupSyncBackoffStrategy', fn: groupSyncBackoffStrategy },
  ];

  for (const { name, fn } of strategies) {
    describe(name, () => {
      it('should return 1000ms for attempt 0', () => {
        expect(fn(0)).toBe(1_000);
      });

      it('should return 5000ms for attempt 1', () => {
        expect(fn(1)).toBe(5_000);
      });

      it('should return 30000ms for attempt 2', () => {
        expect(fn(2)).toBe(30_000);
      });

      it('should return 30000ms (last delay) for attempt >= 3', () => {
        expect(fn(3)).toBe(30_000);
        expect(fn(10)).toBe(30_000);
      });
    });
  }
});
