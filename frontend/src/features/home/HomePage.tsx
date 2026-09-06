import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { apiGet } from '@/lib/apiClient';
import { STALE_TIME } from '@/lib/queryClient';

interface HealthCheck {
  status: 'ok' | 'down';
  required: boolean;
}

interface ReadinessResponse {
  status: string;
  checks: Record<string, HealthCheck>;
  replicaSet: boolean;
}

/**
 * Phase 1 placeholder.
 *
 * It is wired to the real `/health/ready` endpoint rather than being static
 * markup, so this page proves the whole chain end to end: Vite → axios (with
 * credentials + CSRF) → CORS → Express → MongoDB/MinIO/Redis. Replaced by the
 * real storefront homepage in Phase 4.
 */
export default function HomePage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: () => apiGet<ReadinessResponse>('/health/ready'),
    staleTime: STALE_TIME.NONE,
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-primary text-sm font-medium tracking-wide uppercase">Aurora</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">
        Platform scaffold is running
      </h1>
      <p className="text-muted-foreground mt-3 text-base leading-relaxed">
        Phase 1 complete. This page calls the live API, so a green row below means that service is
        genuinely reachable through the real request path.
      </p>

      <div className="bg-card mt-10 rounded-xl border p-5">
        <h2 className="text-sm font-medium">Backing services</h2>

        {isPending && (
          <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking services…
          </div>
        )}

        {isError && (
          <p className="text-destructive mt-4 text-sm">
            {error instanceof Error ? error.message : 'Could not reach the API'}
          </p>
        )}

        {data && (
          <ul className="mt-4 space-y-2.5">
            {Object.entries(data.checks).map(([name, check]) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="capitalize">{name}</span>
                <span
                  className={
                    check.status === 'ok'
                      ? 'text-success flex items-center gap-1.5 font-medium'
                      : 'text-destructive flex items-center gap-1.5 font-medium'
                  }
                >
                  {check.status === 'ok' ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-4" aria-hidden="true" />
                  )}
                  {check.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        Next: Phase 2 — models, authentication, RBAC and the storage/email integrations.
      </p>
    </div>
  );
}
