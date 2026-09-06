import { Outlet } from 'react-router';

/**
 * Customer-facing chrome. The header, navigation, cart drawer and footer are
 * added in Phase 4 — this keeps the shell honest until then.
 */
export function StoreLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
