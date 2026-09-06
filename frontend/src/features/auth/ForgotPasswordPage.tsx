import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Seo } from '@/components/common/Seo';
import { apiPost } from '@/lib/apiClient';

/**
 * Request a password reset.
 *
 * The confirmation is deliberately identical whether or not an account exists —
 * the server responds the same way for the same reason. Saying "no account with
 * that email" here would turn this form into an account-enumeration oracle.
 */
export default function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await apiPost('/auth/forgot-password', values).catch(() => undefined);
    // Shown regardless of outcome, matching the server's response.
    setIsSent(true);
  });

  if (isSent) {
    return (
      <>
        <Seo title="Check your email" noIndex />
        <div className="text-center">
          <div className="bg-success/10 text-success mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            If an account exists for{' '}
            <strong className="text-foreground">{getValues('email')}</strong>, we have sent a link
            to reset your password. It expires in an hour.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title="Reset your password" noIndex />

      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Enter the email address on your account and we will send you a link.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p role="alert" className="text-destructive text-xs">
              {errors.email.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Send reset link
        </Button>

        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </form>
    </>
  );
}
