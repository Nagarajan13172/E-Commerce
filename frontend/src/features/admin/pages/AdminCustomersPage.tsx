import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, Users } from 'lucide-react';
import { USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from '@ecom/shared';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { Pagination } from '@/features/catalog/components/Pagination';
import { useAuth } from '@/features/auth/api/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/format';
import { useAdminCustomers, useUpdateCustomerRole, useUpdateCustomerStatus } from '../api/queries';
import { AdminTable, type Column } from '../components/AdminTable';
import type { AdminCustomer } from '../api/admin.api';

const STATUS_TONE: Record<UserStatus, string> = {
  active: 'bg-success/15 text-success',
  disabled: 'bg-muted text-muted-foreground',
  banned: 'bg-destructive/15 text-destructive',
};

export default function AdminCustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const debouncedTerm = useDebouncedValue(term, 350);
  const { user: me, hasPermission } = useAuth();

  const role = searchParams.get('role') as UserRole | null;
  const page = Number(searchParams.get('page') ?? 1);

  const { data, isPending, isError, error, refetch, isFetching } = useAdminCustomers({
    ...(debouncedTerm ? { q: debouncedTerm } : {}),
    ...(role ? { role } : {}),
    page,
  });

  const updateStatus = useUpdateCustomerStatus();
  const updateRole = useUpdateCustomerRole();

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const columns: Column<AdminCustomer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (customer) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{customer.name}</p>
          <p className="text-muted-foreground truncate text-xs">{customer.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (customer) => (
        <Badge variant="secondary" className="capitalize">
          {customer.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (customer) => (
        <Badge variant="secondary" className={`capitalize ${STATUS_TONE[customer.status]}`}>
          {customer.status}
        </Badge>
      ),
    },
    {
      key: 'verified',
      header: 'Email',
      secondary: true,
      render: (customer) => (
        <span className="text-muted-foreground text-xs">
          {customer.emailVerifiedAt ? 'Confirmed' : 'Unconfirmed'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      secondary: true,
      render: (customer) => (
        <span className="text-muted-foreground text-xs">{formatDate(customer.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (customer) => {
        // The server refuses self-modification anyway; hiding the control stops
        // an admin discovering that only by triggering an error.
        const isSelf = customer._id === me?.id;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isSelf}>
                Manage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              {USER_STATUSES.filter((status) => status !== customer.status).map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => updateStatus.mutate({ id: customer._id, status })}
                  className="capitalize"
                >
                  Mark {status}
                </DropdownMenuItem>
              ))}

              {hasPermission('customer:manage-roles') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Role</DropdownMenuLabel>
                  {USER_ROLES.filter((r) => r !== customer.role).map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => updateRole.mutate({ id: customer._id, role: r })}
                      className="capitalize"
                    >
                      Make {r}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <Seo title="Customers — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Customers</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} account${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setParam('q', event.target.value || undefined);
            }}
            placeholder="Name, email or phone"
            aria-label="Search customers"
            className="pl-9"
          />
        </div>

        <Select
          value={role ?? 'all'}
          onValueChange={(value) => setParam('role', value === 'all' ? undefined : value)}
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {USER_ROLES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={data?.data.items ?? []}
            rowKey={(customer) => customer._id}
            isLoading={isPending}
            isRefreshing={isFetching && !isPending}
            empty={<EmptyState icon={Users} title="No customers match those filters" />}
          />

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => setParam('page', String(next))}
            />
          )}
        </>
      )}
    </>
  );
}
