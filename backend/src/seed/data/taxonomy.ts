/**
 * Category tree and brands.
 *
 * Real category names and real brands, because the seed data has to exercise the
 * things a lorem-ipsum catalog never would: nested filtering three levels deep,
 * brands that span multiple categories, and facets with enough distinct values
 * to be worth rendering.
 */

export interface SeedCategory {
  name: string;
  description: string;
  isFeatured?: boolean;
  children?: SeedCategory[];
}

export const seedCategories: SeedCategory[] = [
  {
    name: 'Electronics',
    description: 'Phones, laptops, audio and everything that plugs in.',
    isFeatured: true,
    children: [
      {
        name: 'Mobiles & Tablets',
        description: 'Smartphones and tablets from every major brand.',
        children: [
          { name: 'Smartphones', description: 'Flagship and mid-range smartphones.' },
          { name: 'Tablets', description: 'Tablets for work, study and play.' },
        ],
      },
      {
        name: 'Computers',
        description: 'Laptops, desktops and accessories.',
        children: [
          { name: 'Laptops', description: 'Ultrabooks, creator laptops and gaming machines.' },
          { name: 'Keyboards & Mice', description: 'Mechanical keyboards and precision mice.' },
        ],
      },
      {
        name: 'Audio',
        description: 'Headphones, earbuds and speakers.',
        isFeatured: true,
        children: [
          { name: 'Headphones', description: 'Over-ear and on-ear headphones.' },
          { name: 'Earbuds', description: 'True wireless earbuds.' },
          { name: 'Speakers', description: 'Portable and home speakers.' },
        ],
      },
    ],
  },
  {
    name: 'Fashion',
    description: 'Clothing, footwear and accessories.',
    isFeatured: true,
    children: [
      {
        name: 'Men',
        description: "Men's clothing and footwear.",
        children: [
          { name: "Men's Footwear", description: 'Sneakers, running shoes and formal shoes.' },
          { name: "Men's Clothing", description: 'T-shirts, shirts and jackets.' },
        ],
      },
      {
        name: 'Women',
        description: "Women's clothing and footwear.",
        children: [
          { name: "Women's Footwear", description: 'Sneakers, flats and heels.' },
          { name: "Women's Clothing", description: 'Dresses, tops and outerwear.' },
        ],
      },
      { name: 'Bags & Luggage', description: 'Backpacks, totes and travel luggage.' },
    ],
  },
  {
    name: 'Home & Kitchen',
    description: 'Appliances, cookware and furnishings.',
    isFeatured: true,
    children: [
      { name: 'Kitchen Appliances', description: 'Coffee makers, blenders and air fryers.' },
      { name: 'Cookware', description: 'Pans, pots and knife sets.' },
      { name: 'Home Decor', description: 'Lighting, storage and soft furnishings.' },
    ],
  },
  {
    name: 'Beauty & Personal Care',
    description: 'Skincare, haircare and fragrance.',
    isFeatured: true,
    children: [
      { name: 'Skincare', description: 'Cleansers, serums and moisturisers.' },
      { name: 'Haircare', description: 'Shampoo, conditioner and styling.' },
      { name: 'Fragrance', description: 'Eau de parfum and body mists.' },
    ],
  },
];

export interface SeedBrand {
  name: string;
  description: string;
  isFeatured?: boolean;
}

export const seedBrands: SeedBrand[] = [
  {
    name: 'Nova',
    description: 'Consumer electronics built around long battery life.',
    isFeatured: true,
  },
  {
    name: 'Lumen',
    description: 'Audio equipment tuned for a neutral, honest sound.',
    isFeatured: true,
  },
  {
    name: 'Corevale',
    description: 'Laptops and peripherals for developers and creators.',
    isFeatured: true,
  },
  { name: 'Stride', description: 'Performance running and training footwear.', isFeatured: true },
  { name: 'Meridian', description: 'Everyday apparel in natural fabrics.' },
  {
    name: 'Kettleworks',
    description: 'Kitchen appliances with a ten-year guarantee.',
    isFeatured: true,
  },
  { name: 'Terracotta', description: 'Cookware and tableware made to be used daily.' },
  {
    name: 'Botanic Lab',
    description: 'Dermatologist-tested skincare with short ingredient lists.',
    isFeatured: true,
  },
  { name: 'Haven', description: 'Home textiles and lighting.' },
  { name: 'Ridgeline', description: 'Backpacks and luggage for people who actually travel.' },
];
