import { Outlet, ScrollRestoration } from 'react-router';

/**
 * Outermost shell: concerns that apply to every page regardless of section
 * (storefront, account, admin, auth).
 */
export function RootLayout() {
  return (
    <>
      {/* Keyboard users can jump past the navigation on every page. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Outlet />
      {/* Restores scroll position on back/forward, and starts new routes at the
          top — browsers do not do this correctly for client-side navigation. */}
      <ScrollRestoration />
    </>
  );
}
