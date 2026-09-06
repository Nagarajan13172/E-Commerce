import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import { RootLayout } from '@/layouts/RootLayout';
import { StoreLayout } from '@/layouts/StoreLayout';
import { RouteError } from '@/components/common/RouteError';
import { PageLoader } from '@/components/common/PageLoader';

/**
 * Route-level code splitting.
 *
 * Every page is lazy so the initial storefront bundle stays small. The admin
 * subtree in particular is split as a whole: a customer must never download the
 * dashboard, its tables or its charting library.
 */
const HomePage = lazy(() => import('@/features/home/HomePage'));

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <StoreLayout />,
        children: [{ index: true, element: withSuspense(<HomePage />) }],
      },
    ],
  },
]);
