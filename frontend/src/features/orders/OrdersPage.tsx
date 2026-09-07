import { useState } from 'react';
import { Link } from 'react-router';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { Pagination } from '@/features/catalog/components/Pagination';
import { formatCurrency, formatDate } from '@/lib/format';
import { useOrders } from './api/queries';
import { OrderStatusBadge } from './components/OrderStatusBadge';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = useOrders(page);

  return (
    <>
      <Seo title="Orders" noIndex />

      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Orders</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {isPending
            ? 'Loading your orders…'
            : `${data?.meta.total ?? 0} order${data?.meta.total === 1 ? '' : 's'}`}
        </p>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Once you place an order it will appear here, with its status and tracking."
          action={
            <Button asChild>
              <Link to="/products">Start shopping</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {data.items.map((order) => (
              <li key={order._id}>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`/account/orders/${order.orderNumber}`}
                          className="font-mono text-sm font-medium hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Placed {formatDate(order.placedAt ?? order.createdAt)}
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    {/* Thumbnails come from the order's own snapshot, so a
                        product later renamed or deleted does not change what a
                        past order shows. */}
                    <div className="mt-4 flex items-center gap-2">
                      {order.items.slice(0, 4).map((item) => (
                        <img
                          key={item._id}
                          src={item.productSnapshot.thumbnail}
                          alt=""
                          className="bg-muted size-12 rounded-md object-cover"
                          loading="lazy"
                        />
                      ))}
                      {order.items.length > 4 && (
                        <span className="text-muted-foreground text-xs tabular">
                          +{order.items.length - 4}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-medium tabular">
                        {formatCurrency(order.pricing.grandTotal, order.pricing.currency)}
                      </span>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/account/orders/${order.orderNumber}`}>View details</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
