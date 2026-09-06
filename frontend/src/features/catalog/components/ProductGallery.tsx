import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductImage } from '@/components/common/ProductImage';
import { cn } from '@/lib/utils';
import type { ProductImage as ProductImageType } from '@/types/catalog';

interface ProductGalleryProps {
  images: ProductImageType[];
  productName: string;
}

/**
 * Product image gallery.
 *
 * Thumbnails are a proper tablist so arrow keys move between images, and the
 * main image announces its position. Hover-zoom is applied with a transform on
 * the image rather than a magnifier overlay — it degrades gracefully on touch,
 * where there is no hover to trigger it.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const ordered = [...images].sort((a, b) => a.position - b.position);
  const active = ordered[activeIndex] ?? ordered[0];

  const step = (delta: number) =>
    setActiveIndex((index) => (index + delta + ordered.length) % ordered.length);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    });
  };

  if (ordered.length === 0) {
    return <ProductImage alt={productName} className="rounded-xl border" priority />;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
      <div className="relative min-w-0 flex-1">
        <div
          className="overflow-hidden rounded-xl border"
          onMouseEnter={() => setIsZoomed(true)}
          onMouseLeave={() => setIsZoomed(false)}
          onMouseMove={handleMouseMove}
        >
          <div
            className="transition-transform duration-200"
            style={{
              transform: isZoomed ? 'scale(1.75)' : 'scale(1)',
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
          >
            <ProductImage
              src={active?.url}
              alt={active?.alt || `${productName} — image ${activeIndex + 1}`}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>

        {ordered.length > 1 && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="absolute top-1/2 left-2 size-9 -translate-y-1/2 rounded-full shadow-sm"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => step(1)}
              aria-label="Next image"
              className="absolute top-1/2 right-2 size-9 -translate-y-1/2 rounded-full shadow-sm"
            >
              <ChevronRight className="size-4" />
            </Button>
            <p className="sr-only" aria-live="polite">
              Image {activeIndex + 1} of {ordered.length}
            </p>
          </>
        )}
      </div>

      {ordered.length > 1 && (
        <div
          role="tablist"
          aria-label={`${productName} images`}
          aria-orientation="horizontal"
          className="flex gap-2 overflow-x-auto sm:w-20 sm:flex-col sm:overflow-visible"
        >
          {ordered.map((image, index) => (
            <button
              key={image.url}
              role="tab"
              type="button"
              aria-selected={index === activeIndex}
              aria-label={`Show image ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  step(1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  step(-1);
                }
              }}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors sm:size-20',
                index === activeIndex ? 'border-primary' : 'border-transparent hover:border-border',
              )}
            >
              <img
                src={image.url}
                alt=""
                className="bg-muted size-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
