import { useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  IndianRupee,
  Package,
  ShoppingCart,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsRange } from '@ecom/shared';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Seo } from '@/components/common/Seo';
import { ErrorState } from '@/components/common/ErrorState';
import { formatCompact, formatCurrency, formatDate } from '@/lib/format';
import { useDashboard } from '../api/queries';
import { MetricCard } from '../components/MetricCard';
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom',
};

/**
 * Chart colours come from the theme tokens, not hard-coded hexes, so they stay
 * consistent with the rest of the interface and adapt to dark mode. The order is
 * chosen for maximum separation between adjacent series.
 */
const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

export default function DashboardPage() {
  const [range, setRange] = useState<AnalyticsRange>('last_30_days');
  const { data, isPending, isError, error, refetch, isFetching } = useDashboard({ range });

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const summary = data?.summary;

  return (
    <>
      <Seo title="Admin dashboard" noIndex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {data && (
            <p className="text-muted-foreground mt-1 text-sm">
              {formatDate(data.range.from)} – {formatDate(data.range.to)}
            </p>
          )}
        </div>

        <Select value={range} onValueChange={(value) => setRange(value as AnalyticsRange)}>
          <SelectTrigger className="w-[170px]" aria-label="Reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as AnalyticsRange[])
              .filter((key) => key !== 'custom')
              .map((key) => (
                <SelectItem key={key} value={key}>
                  {RANGE_LABELS[key]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Needs-attention strip: the two things a manager should act on today. */}
      {summary && (summary.totals.pendingOrders > 0 || summary.totals.lowStock > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {summary.totals.pendingOrders > 0 && (
            <Link to="/admin/orders?status=confirmed" className="rounded-lg">
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="flex items-center gap-3 pt-6">
                  <ShoppingCart className="text-primary size-5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium tabular">
                      {summary.totals.pendingOrders} order
                      {summary.totals.pendingOrders === 1 ? '' : 's'} to fulfil
                    </p>
                    <p className="text-muted-foreground text-xs">Confirmed, packed or processing</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {summary.totals.lowStock > 0 && (
            <Link to="/admin/inventory?lowStockOnly=1" className="rounded-lg">
              <Card className="hover:border-warning/40 transition-colors">
                <CardContent className="flex items-center gap-3 pt-6">
                  <AlertTriangle
                    className="text-warning-tint-foreground size-5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium tabular">
                      {summary.totals.lowStock} product
                      {summary.totals.lowStock === 1 ? '' : 's'} low on stock
                    </p>
                    <p className="text-muted-foreground text-xs">
                      At or below the reorder threshold
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          metric={summary?.revenue}
          format={(v) => formatCurrency(v)}
          icon={IndianRupee}
          isLoading={isPending}
        />
        <MetricCard
          label="Orders"
          metric={summary?.orders}
          format={(v) => formatCompact(v)}
          icon={ShoppingCart}
          isLoading={isPending}
        />
        <MetricCard
          label="Average order value"
          metric={summary?.averageOrderValue}
          format={(v) => formatCurrency(v)}
          icon={TrendingUp}
          isLoading={isPending}
        />
        <MetricCard
          label="New customers"
          metric={summary?.newCustomers}
          format={(v) => formatCompact(v)}
          icon={UserPlus}
          isLoading={isPending}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold">Revenue over time</h2>
            <p className="text-muted-foreground mb-4 text-xs">Paid orders, net of refunds</p>

            {isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={data?.salesByDay ?? []} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) => value.slice(5)}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(value: number) => formatCompact(value)}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                      labelFormatter={(label) => formatDate(String(label))}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#revenueFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold">Revenue by category</h2>
            <p className="text-muted-foreground mb-4 text-xs">Where the money came from</p>

            {isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : (data?.salesByCategory.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-16 text-center text-sm">
                No sales in this period
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={data?.salesByCategory ?? []}
                      dataKey="revenue"
                      nameKey="_id"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {(data?.salesByCategory ?? []).map((entry, index) => (
                        <Cell key={entry._id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* A legend with values, because a pie chart alone cannot be
                    read precisely — and colour is not the only cue. */}
                <ul className="mt-3 space-y-1.5">
                  {(data?.salesByCategory ?? []).slice(0, 5).map((entry, index) => (
                    <li key={entry._id} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{entry._id}</span>
                      <span className="tabular">{formatCurrency(entry.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent orders</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/orders">View all</Link>
              </Button>
            </div>

            {isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (data?.recentOrders.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No orders yet</p>
            ) : (
              <ul className="divide-y">
                {data?.recentOrders.map((order) => (
                  <li key={order._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/orders/${order._id}`}
                        className="font-mono text-xs font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">{order.email}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <span className="text-sm font-medium tabular">
                      {formatCurrency(order.pricing.grandTotal, order.pricing.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              <Package className="size-4" aria-hidden="true" />
              Best sellers
            </h2>

            {isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.topProducts.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No sales in this period
              </p>
            ) : (
              <ul className="divide-y">
                {data?.topProducts.map((product) => (
                  <li key={product._id} className="flex items-center gap-3 py-2.5">
                    <img
                      src={product.thumbnail}
                      alt=""
                      className="bg-muted size-9 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/products/${product.slug}`}
                        className="line-clamp-1 text-sm hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-muted-foreground text-xs tabular">{product.units} sold</p>
                    </div>
                    <span className="text-sm font-medium tabular">
                      {formatCurrency(product.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
