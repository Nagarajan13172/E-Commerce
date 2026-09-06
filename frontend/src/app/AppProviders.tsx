import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { store } from '@/store';
import { useAppSelector } from '@/store/hooks';
import { selectTheme } from '@/store/selectors';
import { queryClient } from '@/lib/queryClient';
import { setAuthFailureHandler } from '@/lib/apiClient';
import { authKeys } from '@/features/auth/api/queries';

/**
 * Connects the API client's session-failure signal to the query cache.
 *
 * When a token refresh fails, the cached session must be marked signed-out and
 * everything fetched as that user discarded. This is registered as a callback
 * rather than imported by the API client, which would create a cycle
 * (client → cache → client) and make the client untestable on its own.
 */
function SessionBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthFailureHandler(() => {
      // Signed-out first (so guards react immediately), then drop everything
      // else — see the note in `useLogout` for why the order matters.
      queryClient.setQueryData(authKeys.currentUser(), null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    });
  }, []);

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
