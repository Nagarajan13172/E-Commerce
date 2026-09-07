import { useState } from 'react';
import { Link } from 'react-router';
import { CreditCard } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';
import { Pagination } from '@/features/catalog/components/Pagination';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { AdminTable, type Column } from '../components/AdminTable';
import { usePayments } from '../api/catalogQueries';
import type { AdminPayment } from '../api/catalog.api';

/**
 * The payment ledger.
 *
 * Read-only on purpose. A refund is an operation on an *order* — it has to
 * check what remains refundable, move the order through its state machine and
 * write a timeline entry — so it lives on the order screen. Offering a refund
 * button here would be a second path into that logic, and the one most likely
 * to skip a step.
 */
const TONE: Record<string, StatusTone> = {
  paid: 'success',
  created: 'neutral',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
  partially_refunded: 'warning',
};

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch, isFetching } = usePayments(page);

  const columns: Column<AdminPayment>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (payment) =>
        payment.order ? (
          <Link
            to={`/admin/orders/${payment.order._id}`}
            className="font-mono text-sm hover:underline"
          >
            {payment.order.orderNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">Order deleted</span>
        ),
    },
    {
      key: 'customer',
      header: 'Customer',
      secondary: true,
      render: (payment) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{payment.user?.name ?? 'Guest'}</p>
          <p className="text-muted-foreground truncate text-xs">{payment.user?.email}</p>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Reference',
      secondary: true,
      render: (payment) => (
        <div className="min-w-0">
          <p className="text-muted-foreground truncate font-mono text-xs">
            {payment.providerPaymentId ?? payment.providerOrderId}
          </p>
          <p className="text-muted-foreground text-xs capitalize">{payment.provider}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (payment) => (
        <div>
          <p className="text-sm tabular">{formatCurrency(payment.amount, payment.currency)}</p>
          {payment.amountRefunded > 0 && (
            <p className="text-muted-foreground text-xs tabular">
              −{formatCurrency(payment.amountRefunded, payment.currency)} refunded
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (payment) => (
        <div>
          <StatusBadge tone={TONE[payment.status] ?? 'neutral'}>
            <span className="capitalize">{payment.status.replace(/_/g, ' ')}</span>
          </StatusBadge>
          {payment.failureReason && (
            <p className="text-muted-foreground mt-1 max-w-48 truncate text-xs">
              {payment.failureReason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'When',
      secondary: true,
      className: 'text-right',
      render: (payment) => (
        <span className="text-muted-foreground text-xs">{formatDateTime(payment.createdAt)}</span>
      ),
    },
  ];

  return (
    <>
      <Seo title="Payments — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Payments</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} payment${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={data?.data.items ?? []}
            rowKey={(payment) => payment._id}
            isLoading={isPending}
            isRefreshing={isFetching && !isPending}
            empty={
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Payments appear here as soon as a customer checks out."
              />
            }
          />

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
