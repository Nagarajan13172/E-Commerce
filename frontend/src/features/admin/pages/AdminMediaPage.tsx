import { useState } from 'react';
import { Check, Copy, ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { Pagination } from '@/features/catalog/components/Pagination';
import { formatDate } from '@/lib/format';
import { ImageUploader, type ProductImage } from '../components/ImageUploader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDeleteMedia, useMediaLibrary } from '../api/catalogQueries';
import type { MediaAsset } from '../api/catalog.api';

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Everything uploaded, in one place.
 *
 * Deleting is genuinely destructive here — unlike almost everything else in
 * this admin, media is removed from object storage rather than soft-deleted,
 * along with every derivative generated from it. A product still referencing
 * the file keeps a URL that now 404s, so the confirmation says so plainly.
 */
export default function AdminMediaPage() {
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useMediaLibrary(page);
  const deleteMedia = useDeleteMedia();

  const items = data?.data.items ?? [];

  const copyUrl = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(asset._id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard access is refused in some contexts; say so rather than
      // silently appearing to have copied.
      toast.error('Could not copy — select the URL and copy it manually');
    }
  };

  return (
    <>
      <Seo title="Media — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Media</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} file${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      <div className="mb-8">
        {/* The uploader is shared with the product form, so the presign,
            direct-to-storage PUT and magic-byte confirm behave identically in
            both places. Nothing is attached to a product here — the point is to
            get a URL to paste elsewhere, such as a brand logo. */}
        <ImageUploader
          images={[]}
          onChange={(images: ProductImage[]) => {
            if (images.length > 0) void refetch();
          }}
        />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Nothing uploaded yet"
          description="Files added here are available to every product, brand and category."
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((asset) => (
              <li key={asset._id} className="overflow-hidden rounded-lg border">
                <img
                  src={asset.url}
                  alt={asset.alt ?? ''}
                  className="bg-muted aspect-square w-full object-cover"
                  loading="lazy"
                />
                <div className="space-y-2 p-2.5">
                  <p className="text-muted-foreground truncate text-xs" title={asset.key}>
                    {asset.key.split('/').pop()}
                  </p>
                  <p className="text-muted-foreground text-xs tabular">
                    {formatBytes(asset.size)} · {formatDate(asset.createdAt)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => void copyUrl(asset)}
                    >
                      {copied === asset._id ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="size-3.5" aria-hidden="true" />
                      )}
                      {copied === asset._id ? 'Copied' : 'Copy URL'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(asset)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span className="sr-only">Delete this file</span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this file?"
        description="It is removed from storage along with every derivative, and cannot be recovered. Any product still using it will show a broken image."
        confirmLabel="Delete"
        isPending={deleteMedia.isPending}
        onConfirm={() => {
          if (deleting) {
            deleteMedia.mutate(deleting._id, {
              onSuccess: () => {
                setDeleting(null);
                // Deleting the only row on the last page leaves that page out
                // of range, and an empty grid renders no pagination to get
                // back with. Step back a page first.
                if (items.length === 1 && page > 1) setPage((current) => current - 1);
                else void refetch();
              },
            });
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
