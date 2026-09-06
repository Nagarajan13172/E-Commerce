import { Link } from 'react-router';
import { Compass, Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { Seo } from '@/components/common/Seo';

export default function NotFoundPage() {
  return (
    <>
      <Seo title="Page not found" noIndex />
      <div className="mx-auto max-w-7xl px-4">
        <EmptyState
          icon={Compass}
          title="We can't find that page"
          description="The link may be out of date, or the page may have moved."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/">
                  <Home className="size-4" aria-hidden="true" />
                  Back to home
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/products">
                  <Search className="size-4" aria-hidden="true" />
                  Browse products
                </Link>
              </Button>
            </div>
          }
          className="min-h-[60vh]"
        />
      </div>
    </>
  );
}
