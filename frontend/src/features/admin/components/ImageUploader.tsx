import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { GripVertical, ImagePlus, Loader2, Star, Trash2, TriangleAlert } from 'lucide-react';
import { UPLOAD_LIMITS } from '@ecom/shared';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import * as api from '../api/catalog.api';

export interface ProductImage {
  media?: string;
  url: string;
  alt?: string;
  position: number;
}

interface ImageUploaderProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  disabled?: boolean;
}

interface Pending {
  id: string;
  name: string;
  percent: number;
  error?: string;
}

const ALLOWED = UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES as readonly string[];

/**
 * Drag-and-drop product images.
 *
 * Uploads go **straight to object storage** with a presigned PUT — the bytes
 * never pass through the API. Three round trips per file: ask for a URL, PUT to
 * storage, then confirm so the server can verify the file really is an image by
 * reading its magic bytes. That third step is not a formality: a renamed `.exe`
 * passes every client-side check, and the confirm endpoint deletes the object
 * and returns 400 when the bytes disagree with the declared type.
 *
 * The client-side type and size checks below are courtesy, not security. They
 * exist so someone dragging a 40 MB TIFF learns immediately rather than after
 * the upload. The server re-checks all of it.
 *
 * Reordering is by explicit up/down controls rather than HTML5 drag events.
 * Native dragging is inaccessible without a keyboard equivalent, and a pointer
 * gesture with no fallback would leave the first image — the one that becomes
 * the product thumbnail — unreachable for a keyboard user.
 */
export function ImageUploader({ images, onChange, disabled }: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The live image list, for appending from inside an async upload.
   *
   * Several files upload concurrently and each finishes in its own closure. If
   * they appended to the `images` prop captured at the time the upload started,
   * the last one to finish would overwrite the others and only one image would
   * survive — so appends read the ref, which is always current.
   */
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const remaining = UPLOAD_LIMITS.MAX_IMAGES_PER_PRODUCT - images.length - pending.length;

  const upload = useCallback(
    async (files: File[]) => {
      const accepted: File[] = [];

      for (const file of files) {
        if (!ALLOWED.includes(file.type)) {
          toast.error(`${file.name} is not an image we accept`);
          continue;
        }
        if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }
        accepted.push(file);
      }

      const room = accepted.slice(0, Math.max(0, remaining));
      if (room.length < accepted.length) {
        toast.error(`A product may have at most ${UPLOAD_LIMITS.MAX_IMAGES_PER_PRODUCT} images`);
      }

      for (const file of room) {
        const id = `${file.name}-${Date.now()}-${Math.random()}`;
        setPending((current) => [...current, { id, name: file.name, percent: 0 }]);

        try {
          const presigned = await api.presignUpload({
            filename: file.name,
            contentType: file.type as (typeof UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES)[number],
            size: file.size,
            refType: 'product',
          });

          await api.uploadToStorage(presigned, file, (percent) => {
            setPending((current) => current.map((p) => (p.id === id ? { ...p, percent } : p)));
          });

          const { media } = await api.confirmUpload({ key: presigned.key, alt: '' });

          const appended = [
            ...imagesRef.current,
            { media: media._id, url: media.url, alt: media.alt ?? '' },
          ].map((image, index) => ({ ...image, position: index }));
          imagesRef.current = appended;
          onChange(appended);
          setPending((current) => current.filter((p) => p.id !== id));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed';
          setPending((current) => current.map((p) => (p.id === id ? { ...p, error: message } : p)));
          toast.error(`${file.name}: ${message}`);
        }
      }
    },
    [onChange, remaining],
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next.map((image, index) => ({ ...image, position: index })));
  };

  const remove = (index: number) => {
    onChange(images.filter((_, i) => i !== index).map((image, i) => ({ ...image, position: i })));
  };

  const setAlt = (index: number, alt: string) => {
    onChange(images.map((image, i) => (i === index ? { ...image, alt } : image)));
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) void upload([...event.dataTransfer.files]);
        }}
        className={cn(
          'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <ImagePlus className="text-muted-foreground mx-auto mb-3 size-8" aria-hidden="true" />
        <p className="text-sm font-medium">Drag images here</p>
        <p className="text-muted-foreground mt-1 text-xs">
          JPEG, PNG, WebP or AVIF · up to 10MB each · {Math.max(0, remaining)} slot
          {remaining === 1 ? '' : 's'} left
        </p>

        {/* The dropzone is a convenience; this is the control that actually
            works with a keyboard and a screen reader.

            A `<label>` styled as a button rather than a Button that clicks a
            hidden input: that arrangement leaves two controls for one job, and
            the input itself has no accessible name — axe flags it `label`,
            critical. A label gives the input its name AND activates it, so
            there is exactly one control and it is named. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ALLOWED.join(',')}
          className="sr-only"
          disabled={disabled || remaining <= 0}
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'mt-3 cursor-pointer',
            (disabled || remaining <= 0) && 'pointer-events-none opacity-50',
          )}
        >
          Choose images
        </label>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
              {item.error ? (
                <TriangleAlert className="text-destructive size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.error ? (
                <span className="text-destructive text-xs">{item.error}</span>
              ) : (
                <Progress value={item.percent} className="w-32" />
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="space-y-2">
          {images.map((image, index) => (
            <li key={image.url} className="flex items-center gap-3 rounded-md border p-2.5">
              <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <img
                src={image.url}
                alt=""
                className="bg-muted size-14 shrink-0 rounded object-cover"
                loading="lazy"
              />

              <div className="min-w-0 flex-1">
                <Input
                  value={image.alt ?? ''}
                  onChange={(event) => setAlt(index, event.target.value)}
                  placeholder="Describe this image"
                  aria-label={`Alt text for image ${index + 1}`}
                  className="h-8 text-sm"
                />
                {index === 0 && (
                  <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    Used as the product thumbnail
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <span aria-hidden="true">↑</span>
                  <span className="sr-only">Move image {index + 1} earlier</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <span aria-hidden="true">↓</span>
                  <span className="sr-only">Move image {index + 1} later</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">Remove image {index + 1}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
