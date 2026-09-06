import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { AppProviders } from './app/AppProviders';
import { router } from './routes';

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </AppProviders>
  );
}
