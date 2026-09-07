import { NavLink, Outlet, Link } from 'react-router';
import {
  BadgePercent,
  BarChart3,
  Boxes,
  ChevronLeft,
  CreditCard,
  FolderTree,
  Images,
  MessageSquare,
  Package,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAdminSidebarCollapsed } from '@/store/selectors';
import { toggleAdminSidebar } from '@/store/slices/uiSlice';
import { useAuth } from '@/features/auth/api/queries';
import { cn } from '@/lib/utils';

/**
 * Admin chrome.
 *
 * Navigation is filtered by the signed-in user's permissions, so support staff
 * do not see menu items that would 403 on click. That is presentation only —
 * the server enforces the same rules independently on every request.
 */
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true, permission: 'analytics:read' },
  {
    to: '/admin/orders',
    label: 'Orders',
    icon: ShoppingCart,
    end: false,
    permission: 'order:read',
  },
  {
    to: '/admin/products',
    label: 'Products',
    icon: Package,
    end: false,
    permission: 'product:read',
  },
  {
    to: '/admin/inventory',
    label: 'Inventory',
    icon: Boxes,
    end: false,
    permission: 'inventory:read',
  },
  {
    to: '/admin/customers',
    label: 'Customers',
    icon: Users,
    end: false,
    permission: 'customer:read',
  },
  {
    to: '/admin/reviews',
    label: 'Reviews',
    icon: MessageSquare,
    end: false,
    permission: 'review:moderate',
  },
  {
    to: '/admin/categories',
    label: 'Categories',
    icon: FolderTree,
    end: false,
    permission: 'category:write',
  },
  { to: '/admin/brands', label: 'Brands', icon: Tag, end: false, permission: 'product:write' },
  { to: '/admin/media', label: 'Media', icon: Images, end: false, permission: 'media:write' },
  {
    to: '/admin/payments',
    label: 'Payments',
    icon: CreditCard,
    end: false,
    permission: 'payment:read',
  },
  {
    to: '/admin/coupons',
    label: 'Coupons',
    icon: BadgePercent,
    end: false,
    permission: 'coupon:write',
  },
];

export function AdminLayout() {
  const dispatch = useAppDispatch();
  const isCollapsed = useAppSelector(selectAdminSidebarCollapsed);
  const { user, hasPermission } = useAuth();

  const visible = NAV.filter((item) => hasPermission(item.permission));

  return (
    <div className="bg-muted/30 flex min-h-dvh">
      <aside
        className={cn(
          'bg-sidebar hidden shrink-0 border-r transition-[width] lg:flex lg:flex-col',
          isCollapsed ? 'w-16' : 'w-56',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Link to="/admin" className="text-primary truncate text-lg font-semibold tracking-tight">
            {isCollapsed ? 'A' : 'Aurora'}
          </Link>
          {!isCollapsed && <span className="text-muted-foreground text-xs">Admin</span>}
        </div>

        <nav aria-label="Admin" className="flex-1 space-y-1 p-2">
          {visible.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                  isCollapsed && 'justify-center px-2',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!isCollapsed && label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch(toggleAdminSidebar())}
            className="w-full justify-start"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={cn('size-4 transition-transform', isCollapsed && 'rotate-180')}
            />
            {!isCollapsed && 'Collapse'}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4">
          {/* Mobile navigation: a horizontal scroller rather than a drawer —
              with seven destinations, one tap beats two. */}
          <nav
            aria-label="Admin"
            className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto lg:hidden"
          >
            {visible.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm',
                    isActive ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {user?.name} · <span className="capitalize">{user?.role}</span>
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <Store className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">View store</span>
              </Link>
            </Button>
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
