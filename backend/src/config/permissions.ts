import type { UserRole } from '@ecom/shared';

/**
 * Role-based access control.
 *
 * Routes are gated on *permissions*, not roles. That indirection matters: when
 * a new role is added, or support staff need one extra capability, the change is
 * one line in this table rather than an audit of every `requireRole('admin')`
 * scattered across the routing layer.
 */
export const PERMISSIONS = {
  // Catalog
  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  PRODUCT_DELETE: 'product:delete',
  CATEGORY_WRITE: 'category:write',
  BRAND_WRITE: 'brand:write',
  MEDIA_WRITE: 'media:write',
  MEDIA_DELETE: 'media:delete',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_UPDATE_STATUS: 'order:update-status',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',
  ORDER_NOTE: 'order:note',

  // Customers
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_UPDATE_STATUS: 'customer:update-status',
  CUSTOMER_MANAGE_ROLES: 'customer:manage-roles',

  // Commerce
  COUPON_WRITE: 'coupon:write',
  REVIEW_MODERATE: 'review:moderate',
  PAYMENT_READ: 'payment:read',

  // Platform
  ANALYTICS_READ: 'analytics:read',
  SETTINGS_WRITE: 'settings:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * The matrix.
 *
 * Note what each role deliberately *cannot* do:
 * - `support` can read orders and answer customers, but cannot issue refunds or
 *   change prices — the two actions that directly move money.
 * - `manager` runs the store day to day but cannot grant roles or change
 *   platform settings, so privilege escalation needs a genuine admin.
 * - `customer` holds no admin permission at all; their own data is authorised by
 *   ownership checks in the service layer, not by this table.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  customer: [],

  support: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_NOTE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.REVIEW_MODERATE,
  ],

  manager: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.PRODUCT_DELETE,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.BRAND_WRITE,
    PERMISSIONS.MEDIA_WRITE,
    PERMISSIONS.MEDIA_DELETE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.ORDER_REFUND,
    PERMISSIONS.ORDER_NOTE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_UPDATE_STATUS,
    PERMISSIONS.COUPON_WRITE,
    PERMISSIONS.REVIEW_MODERATE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.ANALYTICS_READ,
  ],

  admin: Object.values(PERMISSIONS),
};

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/** Any role that can reach the admin panel at all. */
export const STAFF_ROLES: readonly UserRole[] = ['support', 'manager', 'admin'];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
