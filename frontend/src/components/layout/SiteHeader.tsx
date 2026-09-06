import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ChevronDown, Heart, LogOut, Menu, Package, ShoppingBag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchBar } from './SearchBar';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAuthUser, selectIsStaff } from '@/store/selectors';
import { logout } from '@/store/slices/authSlice';
import { setCartDrawerOpen } from '@/store/slices/uiSlice';
import { useCart } from '@/features/cart/api/queries';
import { useCategoryTree } from '@/features/catalog/api/queries';
import { cn } from '@/lib/utils';

/**
 * Site header.
 *
 * Two distinct navigation surfaces rather than one that shrinks: desktop gets a
 * persistent category bar, mobile gets a sheet. Collapsing a hover-driven mega
 * menu into a narrow viewport produces something that works with neither touch
 * nor a keyboard, which is why the mobile tree is a plain nested list.
 */
export function SiteHeader() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectAuthUser);
  const isStaff = useAppSelector(selectIsStaff);
  const { data: cart } = useCart();
  const { data: categories } = useCategoryTree();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const topLevel = (categories ?? []).slice(0, 6);
  const itemCount = cart?.itemCount ?? 0;

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground">
        <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs sm:text-sm">
          Free delivery on orders over ₹999 · Easy 7-day returns
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center gap-3">
          {/* Mobile navigation */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>Browse</SheetTitle>
              </SheetHeader>
              <nav className="p-2" aria-label="Categories">
                <ul>
                  {(categories ?? []).map((category) => (
                    <li key={category._id}>
                      <Link
                        to={`/products?category=${category.slug}`}
                        onClick={() => setMobileNavOpen(false)}
                        className="hover:bg-accent flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium"
                      >
                        {category.name}
                        <span className="text-muted-foreground text-xs tabular">
                          {category.productCount}
                        </span>
                      </Link>
                      {category.children.length > 0 && (
                        <ul className="border-muted mb-1 ml-4 border-l pl-2">
                          {category.children.map((child) => (
                            <li key={child._id}>
                              <Link
                                to={`/products?category=${child.slug}`}
                                onClick={() => setMobileNavOpen(false)}
                                className="text-muted-foreground hover:bg-accent hover:text-foreground block rounded-md px-3 py-2 text-sm"
                              >
                                {child.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="shrink-0 text-xl font-semibold tracking-tight">
            <span className="text-primary">Aurora</span>
          </Link>

          <SearchBar className="mx-2 hidden max-w-xl flex-1 md:block" />

          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
              <Link to="/account/wishlist" aria-label="Wishlist">
                <Heart className="size-5" />
              </Link>
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 px-2">
                    <User className="size-5" />
                    <span className="hidden max-w-24 truncate text-sm lg:inline">
                      {user.name.split(' ')[0]}
                    </span>
                    <ChevronDown className="hidden size-3.5 lg:inline" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block text-sm font-medium">{user.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <User className="size-4" /> My account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/orders">
                      <Package className="size-4" /> Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/wishlist">
                      <Heart className="size-4" /> Wishlist
                    </Link>
                  </DropdownMenuItem>
                  {isStaff && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin">Admin dashboard</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void dispatch(logout())}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => dispatch(setCartDrawerOpen(true))}
              aria-label={`Bag, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            >
              <ShoppingBag className="size-5" />
              {itemCount > 0 && (
                <Badge
                  className="absolute -top-0.5 -right-0.5 size-4.5 justify-center rounded-full p-0 text-[10px] tabular"
                  aria-hidden="true"
                >
                  {itemCount > 9 ? '9+' : itemCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Search drops below the logo row on small screens rather than being
            hidden behind an icon — search is the primary way people navigate a
            catalog on a phone. */}
        <div className="pb-3 md:hidden">
          <SearchBar />
        </div>

        {/* Desktop category bar */}
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="-mb-px flex items-center gap-1">
            {topLevel.map((category) => (
              <li key={category._id}>
                <NavLink
                  to={`/products?category=${category.slug}`}
                  className={({ isActive }) =>
                    cn(
                      'hover:text-primary inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'border-primary text-primary' : 'border-transparent',
                    )
                  }
                >
                  {category.name}
                </NavLink>
              </li>
            ))}
            <li>
              <Link
                to="/products?sort=discount"
                className="text-price-sale inline-block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium"
              >
                Deals
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
