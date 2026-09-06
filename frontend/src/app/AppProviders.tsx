import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { store } from '@/store';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCurrentUser, sessionExpired } from '@/store/slices/authSlice';
import { selectTheme } from '@/store/selectors';
import { queryClient } from '@/lib/queryClient';
import { setAuthFailureHandler } from '@/lib/apiClient';

/**
 * Connects the axios refresh interceptor back to Redux.
 *
 * When a refresh fails the API layer needs to clear the session, but it must not
 * import the store directly — that would create a cycle (store → slice → api →
 * store) and make the client untestable in isolation. Registering a callback
 * keeps the dependency pointing one way.
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

  // Restore the session once on boot. The cookie is httpOnly, so asking the
  // server is the only way to know whether one exists.
  useEffect(() => {
    void dispatch(fetchCurrentUser());
  }, [dispatch]);

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
