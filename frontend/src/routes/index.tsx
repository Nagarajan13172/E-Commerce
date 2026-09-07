import { createBrowserRouter } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { RootLayout } from '@/layouts/RootLayout';
import { StoreLayout } from '@/layouts/StoreLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AccountLayout } from '@/layouts/AccountLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { RouteError } from '@/components/common/RouteError';
import { PageLoader } from '@/components/common/PageLoader';
import { RequireAuth, RequireGuest, RequireRole } from './guards';

/**
 * Route-level code splitting.
 *
 * Every page is lazily imported so the initial bundle carries only the shell.
 * That matters most for the pages a first-time visitor never reaches — the
 * account area, the cart, the auth forms — none of which should cost anything
 * on a landing-page visit.
 */
const HomePage = lazy(() => import('@/features/home/HomePage'));
const ProductListingPage = lazy(() => import('@/features/catalog/ProductListingPage'));
const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage'));
const CartPage = lazy(() => import('@/features/cart/CartPage'));
const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('@/features/orders/OrderConfirmationPage'));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage'));

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage'));

const AccountOverviewPage = lazy(() => import('@/features/account/AccountOverviewPage'));
const AddressesPage = lazy(() => import('@/features/account/AddressesPage'));
const WishlistPage = lazy(() => import('@/features/wishlist/WishlistPage'));

// The admin subtree is lazily imported as its own chunk group: a customer who
// never signs in as staff downloads none of it, including recharts.
const DashboardPage = lazy(() => import('@/features/admin/pages/DashboardPage'));
const AdminOrdersPage = lazy(() => import('@/features/admin/pages/AdminOrdersPage'));
const AdminOrderDetailPage = lazy(() => import('@/features/admin/pages/AdminOrderDetailPage'));
const AdminProductsPage = lazy(() => import('@/features/admin/pages/AdminProductsPage'));
const AdminInventoryPage = lazy(() => import('@/features/admin/pages/AdminInventoryPage'));
const AdminCustomersPage = lazy(() => import('@/features/admin/pages/AdminCustomersPage'));
const AdminReviewsPage = lazy(() => import('@/features/admin/pages/AdminReviewsPage'));
const AdminCouponsPage = lazy(() => import('@/features/admin/pages/AdminCouponsPage'));

const NotFoundPage = lazy(() => import('@/features/misc/NotFoundPage'));

const page = (element: ReactNode) => <Suspense fallback={<PageLoader />}>{element}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      // ── Storefront ────────────────────────────────────────────────────────
      {
        element: <StoreLayout />,
        children: [
          { index: true, element: page(<HomePage />) },
          { path: 'products', element: page(<ProductListingPage />) },
          { path: 'products/:slug', element: page(<ProductDetailPage />) },
          { path: 'cart', element: page(<CartPage />) },
          {
            path: 'checkout',
            element: <RequireAuth>{page(<CheckoutPage />)}</RequireAuth>,
          },

          // ── Account (authenticated) ──────────────────────────────────────
          {
            path: 'account',
            element: (
              <RequireAuth>
                <AccountLayout />
              </RequireAuth>
            ),
            children: [
              { index: true, element: page(<AccountOverviewPage />) },
              { path: 'addresses', element: page(<AddressesPage />) },
              { path: 'orders', element: page(<OrdersPage />) },
              { path: 'orders/:orderNumber', element: page(<OrderDetailPage />) },
              { path: 'wishlist', element: page(<WishlistPage />) },
            ],
          },

          // Outside /account so the confirmation link in the order email works
          // even for someone whose session has since expired — the page itself
          // still requires auth, but the URL is stable and shareable.
          {
            path: 'orders/:orderNumber/confirmation',
            element: <RequireAuth>{page(<OrderConfirmationPage />)}</RequireAuth>,
          },

          { path: '*', element: page(<NotFoundPage />) },
        ],
      },

      // ── Admin ─────────────────────────────────────────────────────────────
      // Mounted as a sibling of StoreLayout, not inside it: the admin area has
      // its own chrome and must not inherit the storefront header, footer or
      // cart drawer.
      //
      // RequireRole is UX only. Every route these pages call is independently
      // authorized on the server, and an integration test asserts a 403 on all
      // 46 of them for a customer token — so bypassing this guard in devtools
      // reveals an empty shell, not data.
      {
        path: 'admin',
        element: (
          <RequireRole roles={['support', 'manager', 'admin']}>
            <AdminLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(<DashboardPage />) },
          { path: 'orders', element: page(<AdminOrdersPage />) },
          { path: 'orders/:id', element: page(<AdminOrderDetailPage />) },
          { path: 'products', element: page(<AdminProductsPage />) },
          { path: 'inventory', element: page(<AdminInventoryPage />) },
          { path: 'customers', element: page(<AdminCustomersPage />) },
          { path: 'reviews', element: page(<AdminReviewsPage />) },
          { path: 'coupons', element: page(<AdminCouponsPage />) },
          { path: '*', element: page(<NotFoundPage />) },
        ],
      },

      // ── Auth (signed-out only, except email confirmation) ─────────────────
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            element: <RequireGuest>{page(<LoginPage />)}</RequireGuest>,
          },
          {
            path: 'register',
            element: <RequireGuest>{page(<RegisterPage />)}</RequireGuest>,
          },
          { path: 'forgot-password', element: page(<ForgotPasswordPage />) },
          { path: 'reset-password', element: page(<ResetPasswordPage />) },
          // Reachable while signed in — the link is clicked from an inbox, and
          // the account it confirms is usually already logged in.
          { path: 'verify-email', element: page(<VerifyEmailPage />) },
        ],
      },
    ],
  },
]);
