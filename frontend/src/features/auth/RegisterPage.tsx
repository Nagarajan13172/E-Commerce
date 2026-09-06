import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { registerSchema, type RegisterFormValues, type RegisterInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Seo } from '@/components/common/Seo';
import { authErrorMessage, authFieldErrors, useRegister } from './api/queries';

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const serverError = authErrorMessage(registerMutation.error, 'Unable to create your account.');
  const fieldErrors = authFieldErrors(registerMutation.error);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      marketingOptIn: false,
    },
  });

  useEffect(() => {
    for (const [field, message] of Object.entries(fieldErrors)) {
      setError(field as keyof RegisterFormValues, { message });
    }
  }, [fieldErrors, setError]);

  const onSubmit = handleSubmit((values) => {
    registerMutation.mutate(values, {
      onSuccess: () => navigate('/account', { replace: true }),
    });
  });

  const isBusy = isSubmitting || registerMutation.isPending;

  return (
    <>
      <Seo title="Create an account" noIndex />

      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Already have one?{' '}
        <Link to="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>

      {serverError && (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          {errors.name && (
            <p role="alert" className="text-destructive text-xs">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p role="alert" className="text-destructive text-xs">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby="password-hint"
            {...register('password')}
          />
          <p id="password-hint" className="text-muted-foreground text-xs">
            At least 8 characters, with upper case, lower case and a number.
          </p>
          {errors.password && (
            <p role="alert" className="text-destructive text-xs">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p role="alert" className="text-destructive text-xs">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isBusy}>
          {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Create account
        </Button>
      </form>
    </>
  );
}
