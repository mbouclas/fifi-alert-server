import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertStatus } from '../../generated/prisma';
import { AlertEventNames } from './alert-event-names';
import { AlertStatusEventPublisher } from './alert-status-event.publisher';
import type { AlertStatusChangedEvent } from './alert-status-changed.event';

describe('AlertStatusEventPublisher', () => {
  let emit: jest.Mock<void, [string, AlertStatusChangedEvent]>;
  let publisher: AlertStatusEventPublisher;

  const base = {
    alertId: 1,
    petId: 2,
    creatorId: 3,
    changedBy: 3,
    source: 'user' as const,
  };

  beforeEach(() => {
    emit = jest.fn<void, [string, AlertStatusChangedEvent]>();
    publisher = new AlertStatusEventPublisher({
      emit,
    } as unknown as EventEmitter2);
  });

  it.each([
    ['activated', AlertEventNames.ACTIVATED, AlertStatus.ACTIVE, null],
    [
      'resolved',
      AlertEventNames.RESOLVED,
      AlertStatus.RESOLVED,
      AlertStatus.ACTIVE,
    ],
    [
      'cancelled',
      AlertEventNames.CANCELLED,
      AlertStatus.CANCELLED,
      AlertStatus.ACTIVE,
    ],
    [
      'expired',
      AlertEventNames.EXPIRED,
      AlertStatus.EXPIRED,
      AlertStatus.ACTIVE,
    ],
  ] as const)(
    '%s emits the status event and STATUS_CHANGED',
    (method, eventName, newStatus, previousStatus) => {
      publisher[method]({ ...base, previousStatus });

      expect(emit).toHaveBeenCalledTimes(2);
      const [[firstName, payload], [secondName, secondPayload]] =
        emit.mock.calls;
      expect(firstName).toBe(eventName);
      expect(secondName).toBe(AlertEventNames.STATUS_CHANGED);
      expect(payload).toMatchObject({ ...base, previousStatus, newStatus });
      expect(payload.occurredAt).toBeInstanceOf(Date);
      expect(secondPayload).toBe(payload);
    },
  );

  it('keeps status-specific fields and a provided occurredAt', () => {
    const occurredAt = new Date('2026-01-01T00:00:00Z');
    publisher.cancelled({
      ...base,
      previousStatus: AlertStatus.DRAFT,
      reason: 'mistake',
      occurredAt,
    });

    expect(emit.mock.calls[0][1]).toMatchObject({
      reason: 'mistake',
      occurredAt,
    });
  });

  it('never throws when emitting fails', () => {
    emit.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      publisher.expired({ ...base, previousStatus: AlertStatus.ACTIVE }),
    ).not.toThrow();
  });
});
