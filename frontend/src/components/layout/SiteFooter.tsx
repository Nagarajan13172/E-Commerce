import { Link } from 'react-router';

const FOOTER_SECTIONS = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', to: '/products' },
      { label: 'New arrivals', to: '/products?sort=newest' },
      { label: 'Best sellers', to: '/products?sort=best_selling' },
      { label: 'Deals', to: '/products?sort=discount' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'My account', to: '/account' },
      { label: 'Orders', to: '/account/orders' },
      { label: 'Wishlist', to: '/account/wishlist' },
      { label: 'Addresses', to: '/account/addresses' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Contact us', to: '/contact' },
      { label: 'FAQ', to: '/faq' },
      { label: 'Shipping', to: '/faq#shipping' },
      { label: 'Returns', to: '/faq#returns' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-muted/40 mt-16 border-t">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-primary text-xl font-semibold tracking-tight">Aurora</p>
            <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed">
              Electronics, fashion, home and beauty — chosen carefully and delivered quickly.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.title} aria-labelledby={`footer-${section.title}`}>
              <h2 id={`footer-${section.title}`} className="text-sm font-semibold">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="text-muted-foreground mt-10 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Aurora. A demonstration store.</p>
          <p>Prices include GST where applicable.</p>
        </div>
      </div>
    </footer>
  );
}
