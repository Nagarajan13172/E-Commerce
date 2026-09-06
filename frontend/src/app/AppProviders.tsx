import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { store } from '@/store';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { sessionExpired } from '@/store/slices/authSlice';
import { selectTheme } from '@/store/selectors';
import { queryClient } from '@/lib/queryClient';
import { setAuthFailureHandler } from '@/lib/apiClient';
import { useCurrentUser } from '@/features/auth/api/queries';

/**
 * Restores the session and connects the API layer back to the store.
 *
 * `useCurrentUser` is a TanStack Query hook — it owns the request, its cache and
 * its de-duplication — and commits the result into Redux, which is what the
 * rest of the app reads. No reducer performs I/O.
 *
 * The failure handler is *registered* rather than imported by the API client,
 * which would create a cycle (store → slice → api → store) and make the client
 * untestable on its own.
 */
function SessionBridge({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    setAuthFailureHandler(() => {
      dispatch(sessionExpired());
      // Every cached query was fetched as the previous user; keeping them would
      // leak one account's data into the next session on this device.
      queryClient.clear();
    });
  }, [dispatch]);

  useCurrentUser();

  return <>{children}</>;
}

/** Applies the theme class, following the OS when set to "system". */
function ThemeBridge({ children }: { children: ReactNode }) {
  const theme = useAppSelector(selectTheme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
    };

    apply();
    // Only follow the OS while the user has actually chosen "system".
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionBridge>
          <ThemeBridge>{children}</ThemeBridge>
        </SessionBridge>
      </QueryClientProvider>
    </Provider>
  );
}
