import mongoose from 'mongoose';
import { StockReservation } from '../models/stockReservation.model.js';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import * as inventory from '../services/inventory.service.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('jobs:reservations');

/**
 * Release stock held by checkouts that were never paid for.
 *
 * A TTL index cannot do this job. Deleting the reservation document would
 * remove the record while leaving `reserved` incremented and `available`
 * decremented on the product — stock would silently leak away, a few units at
 * a time, with nothing to explain where it went.
 *
 * So expiry is an explicit sweep: find held reservations past their deadline,
 * move the counters back, write the ledger entry, and mark the order expired.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const expired = await StockReservation.find({
    status: 'held',
    expiresAt: { $lt: new Date() },
  })
    .select('_id order')
    .limit(100)
    .lean();

  if (expired.length === 0) return 0;

  let released = 0;

  for (const reservation of expired) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const wasReleased = await inventory.releaseReservation(
          reservation.order,
          'expired',
          session,
        );
        if (!wasReleased) return;

        const order = await Order.findById(reservation.order).session(session);
        // Only an order still awaiting payment should expire. One that was
        // confirmed in the meantime must be left alone.
        if (order && order.status === 'pending_payment') {
          order.status = 'expired';
          order.timeline.push({
            status: 'expired',
            at: new Date(),
            actorType: 'system',
            note: 'Payment was not completed in time',
          });
          await order.save({ session });

          await Payment.updateOne(
            { order: order._id, status: { $nin: ['paid', 'refunded'] } },
            { $set: { status: 'failed', failureReason: 'Checkout expired' } },
            { session },
          );
        }

        released += 1;
      });
    } catch (err) {
      // One bad reservation must not stop the sweep.
      log.error({ err, orderId: String(reservation.order) }, 'Failed to release a reservation');
    } finally {
      await session.endSession();
    }
  }

  if (released > 0) log.info({ released }, 'Released expired stock reservations');
  return released;
}
