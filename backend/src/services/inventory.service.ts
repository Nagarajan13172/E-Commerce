import mongoose, { type ClientSession, Types } from 'mongoose';
import { ERROR_CODES, type InventoryTxnType } from '@ecom/shared';
import { Product } from '../models/product.model.js';
import { InventoryTransaction } from '../models/inventoryTransaction.model.js';
import { StockReservation } from '../models/stockReservation.model.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { eventBus } from '../events/bus.js';

const log = createLogger('inventory');

/**
 * Inventory movement — the most safety-critical code in the system.
 *
 * ── Why reservations exist ──────────────────────────────────────────────────
 *
 * Between "customer pressed pay" and "provider confirmed payment" there is a
 * window of seconds to minutes. Two obvious designs both fail:
 *
 *   Decrement on payment confirmation → two customers can both pay for the last
 *     unit, and one of them gets an apology instead of a product.
 *   Decrement at add-to-cart → an abandoned cart holds stock hostage for days.
 *
 * So stock is *reserved* when checkout starts, committed when payment succeeds,
 * and released if payment fails or the reservation expires.
 *
 * ── Why this cannot oversell ────────────────────────────────────────────────
 *
 * The guard is in the query, not in application code:
 *
 *   updateOne({ _id, 'variants.stock.available': { $gte: qty } },
 *             { $inc: { 'variants.$.stock.available': -qty, … } })
 *
 * MongoDB evaluates that predicate and applies the update as ONE atomic
 * document operation. There is no read-modify-write window for a second request
 * to slip into. If the predicate fails, `matchedCount` is 0 and we know we lost
 * the race — no locks, no retries, no application-level mutex.
 *
 * Multi-line orders wrap the per-line updates in a transaction so a basket is
 * all-or-nothing; without it, reserving three items and failing on the fourth
 * would silently strand the first three.
 */

export interface StockLine {
  productId: string;
  variantId?: string;
  quantity: number;
}

interface StockSnapshot {
  available: number;
  reserved: number;
  sold: number;
}

/** Where a line's counters live: on a variant, or on the product itself. */
function stockPaths(variantId?: string) {
  return variantId
    ? {
        available: 'variants.$.stock.available',
        reserved: 'variants.$.stock.reserved',
        sold: 'variants.$.stock.sold',
      }
    : { available: 'stock.available', reserved: 'stock.reserved', sold: 'stock.sold' };
}

function matchFilter(line: StockLine, guard?: Record<string, unknown>) {
  const base: Record<string, unknown> = { _id: new Types.ObjectId(line.productId) };
  if (line.variantId) base['variants._id'] = new Types.ObjectId(line.variantId);
  return { ...base, ...guard };
}

/**
 * Reserve stock for every line, atomically.
 *
 * Either all lines are held or none are. The `$gte` guard on each update is what
 * makes a concurrent reservation of the last unit safe: exactly one caller sees
 * `matchedCount === 1`.
 */
export async function reserveStock(
  lines: StockLine[],
  context: { orderId: Types.ObjectId; userId?: string; session: ClientSession },
): Promise<void> {
  for (const line of lines) {
    const paths = stockPaths(line.variantId);
    const before = await readStock(line, context.session);

    const result = await Product.updateOne(
      // The guard and the decrement are one operation. This is the whole
      // oversell defence.
      matchFilter(line, { [paths.available]: { $gte: line.quantity } }),
      { $inc: { [paths.available]: -line.quantity, [paths.reserved]: line.quantity } },
      { session: context.session },
    );

    if (result.matchedCount === 0) {
      // Lost the race, or never had the stock. Throwing aborts the transaction,
      // which rolls back every line reserved so far.
      const available = before?.available ?? 0;
      throw AppError.unprocessable(
        available === 0 ? 'That item just went out of stock' : `Only ${available} left in stock`,
        ERROR_CODES.INSUFFICIENT_STOCK,
        { productId: line.productId, variantId: line.variantId, available },
      );
    }

    await recordMovement(line, 'reserve', -line.quantity, before, context);
  }

  await StockReservation.create(
    [
      {
        order: context.orderId,
        user: context.userId,
        lines: lines.map((line) => ({
          product: new Types.ObjectId(line.productId),
          variantId: line.variantId ? new Types.ObjectId(line.variantId) : undefined,
          quantity: line.quantity,
        })),
        status: 'held',
        expiresAt: new Date(Date.now() + env.STOCK_RESERVATION_MINUTES * 60_000),
      },
    ],
    { session: context.session },
  );

  log.info({ orderId: String(context.orderId), lines: lines.length }, 'Stock reserved');
}

/**
 * Convert a held reservation into a sale: reserved → sold.
 *
 * Idempotent by construction — the status filter means a second call matches
 * nothing. Payment confirmation can arrive twice (verify plus webhook), and
 * decrementing twice would corrupt the ledger.
 */
export async function commitReservation(
  orderId: Types.ObjectId,
  session: ClientSession,
): Promise<boolean> {
  const reservation = await StockReservation.findOneAndUpdate(
    { order: orderId, status: 'held' },
    { $set: { status: 'committed', committedAt: new Date() } },
    { session, new: true },
  );

  // Already committed by the other confirmation path. Not an error.
  if (!reservation) return false;

  for (const line of reservation.lines) {
    const stockLine: StockLine = {
      productId: String(line.product),
      variantId: line.variantId ? String(line.variantId) : undefined,
      quantity: line.quantity,
    };
    const paths = stockPaths(stockLine.variantId);
    const before = await readStock(stockLine, session);

    await Product.updateOne(
      matchFilter(stockLine),
      { $inc: { [paths.reserved]: -line.quantity, [paths.sold]: line.quantity } },
      { session },
    );

    // Sales counters drive merchandising, not inventory correctness.
    await Product.updateOne(
      { _id: line.product },
      { $inc: { soldCount: line.quantity } },
      { session },
    );

    await recordMovement(stockLine, 'sale', line.quantity, before, {
      orderId,
      session,
    });
  }

  log.info({ orderId: String(orderId) }, 'Reservation committed to sale');
  return true;
}

/**
 * Return held stock to available.
 *
 * Called on payment failure, cancellation, and by the expiry sweeper. Also
 * idempotent: releasing twice would invent stock that does not exist.
 */
export async function releaseReservation(
  orderId: Types.ObjectId,
  reason: 'expired' | 'released',
  session: ClientSession,
): Promise<boolean> {
  const reservation = await StockReservation.findOneAndUpdate(
    { order: orderId, status: 'held' },
    { $set: { status: reason, releasedAt: new Date() } },
    { session, new: true },
  );

  if (!reservation) return false;

  for (const line of reservation.lines) {
    const stockLine: StockLine = {
      productId: String(line.product),
      variantId: line.variantId ? String(line.variantId) : undefined,
      quantity: line.quantity,
    };
    const paths = stockPaths(stockLine.variantId);
    const before = await readStock(stockLine, session);

    await Product.updateOne(
      matchFilter(stockLine),
      { $inc: { [paths.reserved]: -line.quantity, [paths.available]: line.quantity } },
      { session },
    );

    await recordMovement(stockLine, 'release', line.quantity, before, { orderId, session });
  }

  log.info({ orderId: String(orderId), reason }, 'Reservation released');
  return true;
}

/** Put sold units back on the shelf — a cancellation after payment, or a return. */
export async function restockOrderLines(
  lines: StockLine[],
  context: { orderId: Types.ObjectId; type: 'return' | 'restock'; session: ClientSession },
): Promise<void> {
  for (const line of lines) {
    const paths = stockPaths(line.variantId);
    const before = await readStock(line, context.session);

    await Product.updateOne(
      matchFilter(line),
      {
        $inc: {
          [paths.available]: line.quantity,
          // Guarded below so a manual adjustment cannot drive `sold` negative.
          [paths.sold]: -Math.min(line.quantity, before?.sold ?? 0),
        },
      },
      { session: context.session },
    );

    await recordMovement(line, context.type, line.quantity, before, {
      orderId: context.orderId,
      session: context.session,
    });
  }
}

/**
 * Manual adjustment by an admin.
 *
 * Runs outside the reservation lifecycle: `available` moves and the ledger
 * records who did it and why. Refuses to drive stock negative.
 */
export async function adjustStock(params: {
  productId: string;
  variantId?: string;
  delta: number;
  actorId: string;
  note?: string;
}): Promise<StockSnapshot> {
  const line: StockLine = {
    productId: params.productId,
    variantId: params.variantId,
    quantity: Math.abs(params.delta),
  };
  const paths = stockPaths(params.variantId);

  const session = await mongoose.startSession();
  try {
    let after: StockSnapshot | null = null;

    await session.withTransaction(async () => {
      const before = await readStock(line, session);
      if (!before) throw AppError.notFound('Product or variant');

      if (before.available + params.delta < 0) {
        throw AppError.unprocessable(
          `Cannot reduce below zero — only ${before.available} in stock`,
          ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      await Product.updateOne(
        matchFilter(line),
        { $inc: { [paths.available]: params.delta } },
        { session },
      );

      await recordMovement(line, 'adjustment', params.delta, before, {
        session,
        actorId: params.actorId,
        note: params.note,
        refType: 'manual',
      });

      after = (await readStock(line, session))!;
    });

    return after!;
  } finally {
    await session.endSession();
  }
}

// ── Internals ───────────────────────────────────────────────────────────────

/** Read the counters a line points at, wherever they live. */
async function readStock(line: StockLine, session: ClientSession): Promise<StockSnapshot | null> {
  const product = await Product.findById(line.productId)
    .select('variants stock')
    .session(session)
    .lean();
  if (!product) return null;

  if (line.variantId) {
    const variant = product.variants.find((v) => String(v._id) === line.variantId);
    return variant
      ? {
          available: variant.stock.available,
          reserved: variant.stock.reserved,
          sold: variant.stock.sold,
        }
      : null;
  }

  return {
    available: product.stock?.available ?? 0,
    reserved: product.stock?.reserved ?? 0,
    sold: product.stock?.sold ?? 0,
  };
}

/**
 * Append to the immutable ledger.
 *
 * The counters say what the stock IS; this says why. Without it, "we show 3 but
 * the shelf has 5" is unanswerable — with it, every unit traces to a sale, a
 * return, an expired reservation or a named person's correction.
 */
async function recordMovement(
  line: StockLine,
  type: InventoryTxnType,
  quantity: number,
  before: StockSnapshot | null,
  context: {
    session: ClientSession;
    orderId?: Types.ObjectId;
    actorId?: string;
    note?: string;
    refType?: 'order' | 'reservation' | 'return' | 'manual' | 'import';
  },
): Promise<void> {
  if (!before) return;

  const after = await readStock(line, context.session);
  if (!after) return;

  await InventoryTransaction.create(
    [
      {
        product: new Types.ObjectId(line.productId),
        variantId: line.variantId ? new Types.ObjectId(line.variantId) : undefined,
        type,
        quantity,
        before,
        after,
        refType: context.refType ?? (context.orderId ? 'order' : 'manual'),
        refId: context.orderId,
        actor: context.actorId ? new Types.ObjectId(context.actorId) : undefined,
        note: context.note,
      },
    ],
    { session: context.session },
  );

  // Merchandising signal, emitted after the fact so it can never affect the
  // transaction that produced it.
  if (after.available === 0 || after.available <= 5) {
    eventBus.emit('inventory.low_stock', {
      productId: line.productId,
      variantId: line.variantId,
      sku: '',
      available: after.available,
    });
  }
}
