import { Link } from 'react-router';
import { AlertTriangle, Heart, MapPin, Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Seo } from '@/components/common/Seo';
import { formatDate } from '@/lib/format';
import { useAuth, useResendVerification } from '@/features/auth/api/queries';

const SHORTCUTS = [
  { to: '/account/orders', icon: Package, title: 'Orders', body: 'Track and review past orders' },
  { to: '/account/addresses', icon: MapPin, title: 'Addresses', body: 'Manage delivery addresses' },
  { to: '/account/wishlist', icon: Heart, title: 'Wishlist', body: 'Items you saved for later' },
];

export default function AccountOverviewPage() {
  const { user } = useAuth();
  const resendVerification = useResendVerification();

  if (!user) return null;

  return (
    <>
      <Seo title="My account" noIndex />

      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Hello, {user.name.split(' ')[0]}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Member since {formatDate(user.createdAt)}
        </p>
      </div>

      {/* An unconfirmed address is surfaced here rather than as a dismissible
          banner: it gates order confirmations, so it needs to stay visible. */}
      {!user.emailVerified && (
        <Alert className="mb-6">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Confirm your email address to secure your account.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resendVerification.isPending}
              onClick={() => resendVerification.mutate(user.email)}
            >
              Resend link
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {SHORTCUTS.map(({ to, icon: Icon, title, body }) => (
          <Link
            key={to}
            to={to}
            className="focus-visible:ring-ring rounded-xl focus-visible:ring-2"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <Icon className="text-primary size-5" aria-hidden="true" />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Name</dt>
              <dd className="mt-0.5">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Email</dt>
              <dd className="mt-0.5 break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Phone</dt>
              <dd className="mt-0.5">{user.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Email confirmed</dt>
              <dd className="mt-0.5">{user.emailVerified ? 'Yes' : 'Not yet'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
