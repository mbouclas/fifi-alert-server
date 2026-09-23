import { Logger } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AlertStatus } from '../../../generated/prisma';
import { AlertStatusEventPublisher } from '../alert-status-event.publisher';
import {
  ALERT_STATUS_HANDLERS,
  AlertActivatedHandler,
  AlertCancelledHandler,
  AlertExpiredHandler,
  AlertResolvedHandler,
} from '.';

describe('Alert status handlers wiring', () => {
  let module: TestingModule;
  let publisher: AlertStatusEventPublisher;

  const base = {
    alertId: 7,
    petId: null,
    creatorId: 3,
    changedBy: 3,
    source: 'user' as const,
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [AlertStatusEventPublisher, ...ALERT_STATUS_HANDLERS],
    }).compile();
    await module.init();

    publisher = module.get(AlertStatusEventPublisher);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module.close();
  });

  it.each([
    ['activated', AlertActivatedHandler, null],
    ['resolved', AlertResolvedHandler, AlertStatus.ACTIVE],
    ['cancelled', AlertCancelledHandler, AlertStatus.ACTIVE],
    ['expired', AlertExpiredHandler, AlertStatus.ACTIVE],
  ] as const)(
    '%s reaches only its own handler',
    async (method, handlerClass, previousStatus) => {
      const spies = ALERT_STATUS_HANDLERS.map((cls) =>
        jest.spyOn(module.get<{ handle: () => void }>(cls), 'handle'),
      );
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      publisher[method]({ ...base, previousStatus });
      await new Promise((resolve) => setImmediate(resolve)); // flush async listeners

      ALERT_STATUS_HANDLERS.forEach((cls, i) => {
        expect(spies[i]).toHaveBeenCalledTimes(cls === handlerClass ? 1 : 0);
      });
    },
  );
});
