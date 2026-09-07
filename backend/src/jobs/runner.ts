import { releaseExpiredReservations } from './releaseExpiredReservations.js';
import { createLogger } from '../config/logger.js';
import { isTest } from '../config/env.js';

const log = createLogger('jobs');

/**
 * Background jobs.
 *
 * A plain interval, deliberately: one scheduled task at a one-minute cadence
 * does not justify a queue, a broker and their operational surface. Redis is
 * already in the stack, so moving to BullMQ when there is more to run — and
 * more than one API instance — is a contained change.
 *
 * The overlap guard matters: a sweep that runs long must not have a second
 * copy start alongside it and fight over the same reservations.
 */
const RESERVATION_SWEEP_MS = 60_000;

let timer: NodeJS.Timeout | undefined;
let isSweeping = false;

export function startJobs(): void {
  if (isTest) return;

  timer = setInterval(() => {
    if (isSweeping) return;
    isSweeping = true;

    void releaseExpiredReservations()
      .catch((err) => log.error({ err }, 'Reservation sweep failed'))
      .finally(() => {
        isSweeping = false;
      });
  }, RESERVATION_SWEEP_MS);

  // Never let a background timer keep the process alive during shutdown.
  timer.unref();
  log.info({ everyMs: RESERVATION_SWEEP_MS }, 'Background jobs started');
}

export function stopJobs(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
