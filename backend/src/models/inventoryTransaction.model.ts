import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { INVENTORY_TXN_TYPES, type InventoryTxnType } from '@ecom/shared';

/**
 * Append-only ledger of every stock movement.
 *
 * The counters on a product tell you *what* the stock is; this tells you *why*.
 * Without it, "we show 3 in stock but the shelf has 5" is unanswerable. With it,
 * every unit is traceable to a sale, a return, a manual correction or a
 * reservation that expired — which is what makes stock discrepancies
 * investigable instead of merely annoying.
 *
 * Rows are never updated or deleted. `before`/`after` are recorded so the ledger
 * can be replayed and reconciled against the live counters.
 */
export interface IInventoryTransaction {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  sku?: string;
  type: InventoryTxnType;
  /** Signed: negative for outflows. */
  quantity: number;
  before: { available: number; reserved: number; sold: number };
  after: { available: number; reserved: number; sold: number };
  /** What caused this — an order, a return, an admin edit. */
  refType?: 'order' | 'reservation' | 'return' | 'manual' | 'import';
  refId?: Types.ObjectId;
  actor?: Types.ObjectId;
  note?: string;
  createdAt: Date;
}

export type InventoryTransactionDocument = HydratedDocument<IInventoryTransaction>;

const stockSnapshot = {
  _id: false,
  available: { type: Number, required: true },
  reserved: { type: Number, required: true },
  sold: { type: Number, required: true },
};

const inventoryTransactionSchema = new Schema<IInventoryTransaction, Model<IInventoryTransaction>>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId },
    sku: { type: String },
    type: { type: String, enum: INVENTORY_TXN_TYPES, required: true },
    quantity: { type: Number, required: true },
    before: { type: stockSnapshot, required: true },
    after: { type: stockSnapshot, required: true },
    refType: { type: String, enum: ['order', 'reservation', 'return', 'manual', 'import'] },
    refId: { type: Schema.Types.ObjectId },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// "History for this variant" — the admin inventory drill-down.
inventoryTransactionSchema.index({ product: 1, variantId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ type: 1, createdAt: -1 });
inventoryTransactionSchema.index({ refType: 1, refId: 1 });

export const InventoryTransaction = model<IInventoryTransaction>(
  'InventoryTransaction',
  inventoryTransactionSchema,
);
