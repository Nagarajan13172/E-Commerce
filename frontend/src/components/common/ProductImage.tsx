import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  /** First-screen images skip lazy loading; everything else defers. */
  priority?: boolean;
  sizes?: string;
}

/**
 * Product imagery with explicit loading and error states.
 *
 * Two things this handles that a bare `<img>` does not:
 *
 * 1. **Layout stability.** The wrapper reserves a square, so the grid does not
 *    reflow as images arrive — cumulative layout shift on a product grid is the
 *    most jarring thing a storefront can do.
 * 2. **A real broken state.** A missing image renders a labelled placeholder
 *    rather than the browser's broken-image glyph and the alt text.
 */
export function ProductImage({
  src,
  alt,
  className,
  priority = false,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
}: ProductImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');

  return (
    <div className={cn('bg-muted relative aspect-square overflow-hidden', className)}>
      {status === 'error' ? (
        <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1.5">
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="px-2 text-center text-[11px] leading-tight">No image</span>
        </div>
      ) : (
        <>
          {status === 'loading' && <div className="bg-muted absolute inset-0 animate-pulse" />}
          <img
            src={src}
            alt={alt}
            sizes={sizes}
            loading={priority ? 'eager' : 'lazy'}
            // Tells the browser to prioritise this image's fetch; meaningful for
            // the hero and the first row of a grid.
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={cn(
              'size-full object-cover transition-opacity duration-300',
              status === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      )}
    </div>
  );
}
