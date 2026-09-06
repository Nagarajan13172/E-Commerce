import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Seo } from '@/components/common/Seo';
import { ApiError, apiPost } from '@/lib/apiClient';
import { useAppDispatch } from '@/store/hooks';
import { fetchCurrentUser } from '@/store/slices/authSlice';

/**
 * Email confirmation landing page.
 *
 * Verification runs once on mount. The ref guard matters under React's StrictMode
 * double-invoke in development: without it the second call would consume the
 * single-use token and show a spurious "link already used" error.
 */
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This confirmation link is missing its token.');
      return;
    }
    if (hasRun.current) return;
    hasRun.current = true;

    apiPost('/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
        // Refresh the session so the header stops showing "unverified".
        void dispatch(fetchCurrentUser());
      })
      .catch((error: unknown) => {
        setStatus('error');
        setMessage(
          error instanceof ApiError ? error.message : 'We could not confirm your email address.',
        );
      });
  }, [token, dispatch]);

  return (
    <>
      <Seo title="Confirm your email" noIndex />

      <div className="text-center">
        {status === 'verifying' && (
          <>
            <Loader2
              className="text-muted-foreground mx-auto size-8 animate-spin"
              aria-hidden="true"
            />
            <p className="text-muted-foreground mt-4 text-sm">Confirming your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="bg-success/10 text-success mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
              <CheckCircle2 className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Email confirmed</h1>
            <p className="text-muted-foreground mt-2 text-sm">Your account is ready to use.</p>
            <Button asChild className="mt-6 w-full">
              <Link to="/products">Start shopping</Link>
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="bg-destructive/10 text-destructive mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
              <XCircle className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Confirmation failed</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{message}</p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to="/account">Go to my account</Link>
            </Button>
          </>
        )}
      </div>
    </>
  );
}
