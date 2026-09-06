import { Link, Outlet } from 'react-router';

/** Centred, distraction-free shell for sign-in and account recovery. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
          <Link to="/" className="text-primary text-xl font-semibold tracking-tight">
            Aurora
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
