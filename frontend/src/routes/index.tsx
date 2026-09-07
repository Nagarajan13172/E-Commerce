import { createBrowserRouter } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { RootLayout } from '@/layouts/RootLayout';
import { StoreLayout } from '@/layouts/StoreLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AccountLayout } from '@/layouts/AccountLayout';
import { RouteError } from '@/components/common/RouteError';
import { PageLoader } from '@/components/common/PageLoader';
import { RequireAuth, RequireGuest } from './guards';

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

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage'));

const AccountOverviewPage = lazy(() => import('@/features/account/AccountOverviewPage'));
const AddressesPage = lazy(() => import('@/features/account/AddressesPage'));
const WishlistPage = lazy(() => import('@/features/wishlist/WishlistPage'));

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
              { path: 'wishlist', element: page(<WishlistPage />) },
            ],
          },

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
