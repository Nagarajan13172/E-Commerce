import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { CartDrawer } from '@/features/cart/components/CartDrawer';
import { useAppDispatch } from '@/store/hooks';
import { closeAllOverlays } from '@/store/slices/uiSlice';

/** Customer-facing chrome: header, content, footer, and the bag drawer. */
export function StoreLayout() {
  const dispatch = useAppDispatch();
  const location = useLocation();

  // Close any open drawer or sheet on navigation. Without this, tapping a
  // category inside the mobile menu leaves the menu covering the page it just
  // navigated to.
  useEffect(() => {
    dispatch(closeAllOverlays());
  }, [location.pathname, dispatch]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
