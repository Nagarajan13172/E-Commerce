import { NavLink, Outlet } from 'react-router';
import { Heart, MapPin, Package, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCOUNT_NAV = [
  { to: '/account', label: 'Overview', icon: User, end: true },
  { to: '/account/orders', label: 'Orders', icon: Package, end: false },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin, end: false },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart, end: false },
];

/**
 * Account shell.
 *
 * The navigation is a sidebar on desktop and a horizontal scroller on mobile
 * rather than a hamburger — with only four destinations, hiding them behind a
 * menu costs a tap and gains nothing.
 */
export function AccountLayout() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="sr-only">My account</h1>

      <div className="flex flex-col gap-8 lg:flex-row">
        <nav aria-label="Account" className="lg:w-56 lg:shrink-0">
          <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
            {ACCOUNT_NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="shrink-0">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
