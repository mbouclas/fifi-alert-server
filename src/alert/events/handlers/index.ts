import { AlertActivatedHandler } from './alert-activated.handler';
import { AlertCancelledHandler } from './alert-cancelled.handler';
import { AlertExpiredHandler } from './alert-expired.handler';
import { AlertResolvedHandler } from './alert-resolved.handler';

export {
  AlertActivatedHandler,
  AlertCancelledHandler,
  AlertExpiredHandler,
  AlertResolvedHandler,
};

/** One handler per alert status; register in AlertModule providers */
export const ALERT_STATUS_HANDLERS = [
  AlertActivatedHandler,
  AlertResolvedHandler,
  AlertCancelledHandler,
  AlertExpiredHandler,
];
