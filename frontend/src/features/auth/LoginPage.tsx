import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { loginSchema, type LoginFormValues, type LoginInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Seo } from '@/components/common/Seo';
import { authErrorMessage, authFieldErrors, useLogin } from './api/queries';

/**
 * Sign in.
 *
 * The form is validated by `loginSchema` from the shared package — the same
 * schema the API validates the request with, so the client cannot accept input
 * the server will reject.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Form feedback is transient and belongs to the form, so it is read straight
  // off the mutation rather than stored in Redux.
  const loginMutation = useLogin();
  const serverError = authErrorMessage(loginMutation.error, 'Unable to sign in. Please try again.');
  const fieldErrors = authFieldErrors(loginMutation.error);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    // Three type arguments: field values (pre-parse), context, and the parsed
    // output the submit handler receives. Zod defaults make those differ.
  } = useForm<LoginFormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  // Surface server-side field errors on the matching inputs.
  useEffect(() => {
    for (const [field, message] of Object.entries(fieldErrors)) {
      setError(field as keyof LoginFormValues, { message });
    }
  }, [fieldErrors, setError]);

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values, {
      onSuccess: () => {
        // Return the user to wherever the guard interrupted them.
        const next = searchParams.get('next');
        navigate(next ? decodeURIComponent(next) : '/account', { replace: true });
      },
    });
  });

  const isBusy = isSubmitting || loginMutation.isPending;

  return (
    <>
      <Seo title="Sign in" noIndex />

      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        New here?{' '}
        <Link to="/register" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>

      {serverError && (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="text-destructive text-xs">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-muted-foreground text-xs hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="password-error" role="alert" className="text-destructive text-xs">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isBusy}>
          {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Sign in
        </Button>
      </form>
    </>
  );
}
