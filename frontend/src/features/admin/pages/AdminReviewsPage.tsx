import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Flag, MessageSquare, X } from 'lucide-react';
import { REVIEW_STATUSES } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Rating } from '@/components/common/Rating';
import { Seo } from '@/components/common/Seo';
import { Pagination } from '@/features/catalog/components/Pagination';
import { formatDate } from '@/lib/format';
import { useAdminReviews, useModerateReview, useRespondToReview } from '../api/queries';

/**
 * Review moderation queue.
 *
 * Defaults to pending, because that is the only view with work in it. Rejecting
 * a review removes it from the product's rating — the server recomputes from
 * approved reviews only, so moderation actually changes what customers see
 * rather than merely hiding a row.
 */
export default function AdminReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const status = searchParams.get('status') ?? 'pending';
  const reported = searchParams.get('reported') === '1';
  const page = Number(searchParams.get('page') ?? 1);

  const { data, isPending, isError, error, refetch } = useAdminReviews({
    ...(status !== 'all' ? { status: status as 'pending' | 'approved' | 'rejected' } : {}),
    ...(reported ? { reported: true } : {}),
    page,
  });

  const moderate = useModerateReview();
  const respond = useRespondToReview();

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  return (
    <>
      <Seo title="Reviews — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reviews</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} review${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={(value) => setParam('status', value)}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reviews</SelectItem>
            {REVIEW_STATUSES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={reported ? 'default' : 'outline'}
          onClick={() => setParam('reported', reported ? undefined : '1')}
        >
          <Flag className="size-4" aria-hidden="true" />
          Reported only
        </Button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : data.data.items.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nothing to moderate"
          description={
            status === 'pending'
              ? 'Every review has been dealt with.'
              : 'No reviews match those filters.'
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {data.data.items.map((review) => (
              <li key={review._id}>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {review.product?.thumbnail && (
                          <img
                            src={review.product.thumbnail}
                            alt=""
                            className="bg-muted size-10 rounded object-cover"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">
                            {review.product?.name ?? 'Unknown product'}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {review.user?.name} · {formatDate(review.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {review.reportedCount > 0 && (
                          <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                            <Flag className="size-3" aria-hidden="true" />
                            {review.reportedCount}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="capitalize">
                          {review.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Rating value={review.rating} showCount={false} size="sm" />
                      {review.title && <p className="mt-1.5 text-sm font-medium">{review.title}</p>}
                      <p className="mt-1 text-sm leading-relaxed">{review.comment}</p>
                    </div>

                    {review.adminResponse && (
                      <div className="bg-muted/50 mt-3 rounded-md p-3">
                        <p className="text-xs font-medium">Store response</p>
                        <p className="mt-0.5 text-sm">{review.adminResponse.text}</p>
                      </div>
                    )}

                    {respondingTo === review._id ? (
                      <div className="mt-3 flex gap-2">
                        <Input
                          value={responseText}
                          onChange={(event) => setResponseText(event.target.value)}
                          placeholder="Write a public response…"
                          aria-label="Response to this review"
                          autoFocus
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={!responseText.trim() || respond.isPending}
                          onClick={() =>
                            respond.mutate(
                              { id: review._id, text: responseText.trim() },
                              {
                                onSuccess: () => {
                                  setRespondingTo(null);
                                  setResponseText('');
                                },
                              },
                            )
                          }
                        >
                          Publish
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRespondingTo(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {review.status !== 'approved' && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={moderate.isPending}
                            onClick={() => moderate.mutate({ id: review._id, status: 'approved' })}
                          >
                            <Check className="size-4" aria-hidden="true" />
                            Approve
                          </Button>
                        )}
                        {review.status !== 'rejected' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={moderate.isPending}
                            onClick={() =>
                              moderate.mutate({
                                id: review._id,
                                status: 'rejected',
                                rejectionReason: 'Does not meet our review guidelines',
                              })
                            }
                          >
                            <X className="size-4" aria-hidden="true" />
                            Reject
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRespondingTo(review._id)}
                        >
                          Respond
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={(next) => setParam('page', String(next))}
          />
        </>
      )}
    </>
  );
}
