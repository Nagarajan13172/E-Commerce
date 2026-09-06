/**
 * Product catalog.
 *
 * Written to exercise the system, not to fill a grid:
 *
 * - Every variant axis appears — colour, size, storage, material — so the facet
 *   pipeline and the variant picker are both genuinely tested.
 * - Stock is uneven on purpose: some variants are out of stock, some sit below
 *   their low-stock threshold, so the availability filter and the admin
 *   low-stock report have something real to show.
 * - Prices span three orders of magnitude, so the price-range facet is not a
 *   single degenerate bucket.
 */

export interface SeedVariant {
  optionValues: { name: string; value: string }[];
  priceDelta?: number;
  available: number;
  lowStockThreshold?: number;
}

export interface SeedProduct {
  name: string;
  brand: string;
  category: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  tags: string[];
  options?: { name: string; values: string[] }[];
  variants?: SeedVariant[];
  /** Used when a product has no variants. */
  stock?: number;
  specifications?: { group?: string; name: string; value: string }[];
  isFeatured?: boolean;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  weightGrams?: number;
}

const colour = (name: string) => ({ name: 'Color', value: name });
const size = (value: string) => ({ name: 'Size', value });
const storage = (value: string) => ({ name: 'Storage', value });
const material = (value: string) => ({ name: 'Material', value });

export const seedProducts: SeedProduct[] = [
  // ── Electronics: Smartphones ──────────────────────────────────────────────
  {
    name: 'Nova Pulse 7',
    brand: 'Nova',
    category: 'Smartphones',
    shortDescription: '6.4" OLED, 5,000mAh battery, three-day standby.',
    description:
      'The Pulse 7 is built around endurance. A 5,000mAh cell and an efficient 4nm chipset give a comfortable two days of mixed use, and the 6.4-inch OLED runs at 120Hz without punishing the battery for it. The camera system favours consistency over headline megapixels: a 50MP main sensor with optical stabilisation, a genuinely usable ultrawide, and night processing that does not smear moving subjects.',
    price: 34999,
    compareAtPrice: 39999,
    tags: ['smartphone', '5g', 'oled', 'long battery'],
    options: [
      { name: 'Color', values: ['Midnight', 'Sage', 'Sand'] },
      { name: 'Storage', values: ['128GB', '256GB'] },
    ],
    variants: [
      { optionValues: [colour('Midnight'), storage('128GB')], available: 42 },
      { optionValues: [colour('Midnight'), storage('256GB')], priceDelta: 4000, available: 18 },
      { optionValues: [colour('Sage'), storage('128GB')], available: 7, lowStockThreshold: 10 },
      { optionValues: [colour('Sage'), storage('256GB')], priceDelta: 4000, available: 0 },
      { optionValues: [colour('Sand'), storage('128GB')], available: 23 },
      { optionValues: [colour('Sand'), storage('256GB')], priceDelta: 4000, available: 11 },
    ],
    specifications: [
      { group: 'Display', name: 'Size', value: '6.4 inch OLED' },
      { group: 'Display', name: 'Refresh rate', value: '120Hz' },
      { group: 'Camera', name: 'Main sensor', value: '50MP, f/1.8, OIS' },
      { group: 'Battery', name: 'Capacity', value: '5000mAh' },
      { group: 'Battery', name: 'Charging', value: '45W wired, 15W wireless' },
    ],
    isFeatured: true,
    isBestseller: true,
    weightGrams: 197,
  },
  {
    name: 'Nova Pulse 7 Lite',
    brand: 'Nova',
    category: 'Smartphones',
    shortDescription: 'The Pulse battery life at half the price.',
    description:
      'The Lite keeps what most people actually notice — the battery, the clean software, the four years of security updates — and trims the parts they do not. The panel is LCD rather than OLED and the chipset is a generation behind, but day-to-day it is hard to tell the difference outside of games.',
    price: 16999,
    compareAtPrice: 19999,
    tags: ['smartphone', 'budget', '5g'],
    options: [{ name: 'Color', values: ['Graphite', 'Ocean'] }],
    variants: [
      { optionValues: [colour('Graphite')], available: 64 },
      { optionValues: [colour('Ocean')], available: 31 },
    ],
    specifications: [
      { group: 'Display', name: 'Size', value: '6.5 inch LCD' },
      { group: 'Battery', name: 'Capacity', value: '5000mAh' },
    ],
    isNewArrival: true,
    weightGrams: 204,
  },

  // ── Electronics: Laptops ──────────────────────────────────────────────────
  {
    name: 'Corevale Studio 14',
    brand: 'Corevale',
    category: 'Laptops',
    shortDescription: '14" 3K display, 16-core CPU, 18-hour battery.',
    description:
      'A 14-inch machine that does not throttle after ten minutes. The chassis is a single piece of milled aluminium with a vapour chamber that keeps sustained loads quiet, and the 3K display covers 100% of DCI-P3 with factory calibration. Ports are the ones people actually use: two Thunderbolt, one HDMI 2.1, a full-size SD reader and a headphone jack.',
    price: 129999,
    compareAtPrice: 144999,
    tags: ['laptop', 'developer', 'creator', 'thunderbolt'],
    options: [
      { name: 'Color', values: ['Space Grey', 'Silver'] },
      { name: 'Storage', values: ['512GB', '1TB', '2TB'] },
    ],
    variants: [
      { optionValues: [colour('Space Grey'), storage('512GB')], available: 12 },
      { optionValues: [colour('Space Grey'), storage('1TB')], priceDelta: 15000, available: 8 },
      {
        optionValues: [colour('Space Grey'), storage('2TB')],
        priceDelta: 35000,
        available: 3,
        lowStockThreshold: 5,
      },
      { optionValues: [colour('Silver'), storage('512GB')], available: 15 },
      { optionValues: [colour('Silver'), storage('1TB')], priceDelta: 15000, available: 0 },
      {
        optionValues: [colour('Silver'), storage('2TB')],
        priceDelta: 35000,
        available: 2,
        lowStockThreshold: 5,
      },
    ],
    specifications: [
      { group: 'Display', name: 'Resolution', value: '3024 × 1964' },
      { group: 'Display', name: 'Colour', value: '100% DCI-P3, factory calibrated' },
      { group: 'Memory', name: 'RAM', value: '32GB unified' },
      { group: 'Battery', name: 'Rated life', value: 'Up to 18 hours' },
    ],
    isFeatured: true,
    isBestseller: true,
    weightGrams: 1580,
  },
  {
    name: 'Corevale Tactile 87',
    brand: 'Corevale',
    category: 'Keyboards & Mice',
    shortDescription: 'Hot-swappable 87-key mechanical keyboard with a gasket mount.',
    description:
      'An 87-key board with a gasket mount, sound-dampening foam and hot-swap sockets, so switches can be changed without a soldering iron. The PBT keycaps are dye-sublimated rather than printed, so the legends will not wear off. Connects over USB-C, Bluetooth to three devices, or a 2.4GHz dongle.',
    price: 8999,
    tags: ['keyboard', 'mechanical', 'hot-swap'],
    options: [{ name: 'Color', values: ['Black', 'White'] }],
    variants: [
      { optionValues: [colour('Black')], available: 55 },
      { optionValues: [colour('White')], available: 9, lowStockThreshold: 12 },
    ],
    specifications: [
      { name: 'Layout', value: '87-key tenkeyless' },
      { name: 'Mount', value: 'Gasket' },
      { name: 'Connectivity', value: 'USB-C, Bluetooth 5.2, 2.4GHz' },
    ],
    isNewArrival: true,
    weightGrams: 820,
  },

  // ── Electronics: Audio ────────────────────────────────────────────────────
  {
    name: 'Lumen Reference One',
    brand: 'Lumen',
    category: 'Headphones',
    shortDescription: 'Open-back studio headphones with a genuinely flat response.',
    description:
      'Open-back, 250-ohm planar drivers tuned to a flat response rather than a flattering one. These are monitoring headphones: mixes that sound right on them travel well. The open design means everyone nearby hears them too, which is the trade for the soundstage.',
    price: 24999,
    tags: ['headphones', 'open-back', 'studio', 'audiophile'],
    options: [{ name: 'Color', values: ['Black', 'Walnut'] }],
    variants: [
      { optionValues: [colour('Black')], available: 22 },
      { optionValues: [colour('Walnut')], priceDelta: 3000, available: 6, lowStockThreshold: 8 },
    ],
    specifications: [
      { name: 'Driver', value: '90mm planar magnetic' },
      { name: 'Impedance', value: '250 ohm' },
      { name: 'Frequency response', value: '8Hz – 45kHz' },
    ],
    isFeatured: true,
    weightGrams: 420,
  },
  {
    name: 'Lumen Drift ANC',
    brand: 'Lumen',
    category: 'Earbuds',
    shortDescription: 'True wireless earbuds with adaptive noise cancellation.',
    description:
      'Adaptive ANC that samples the environment 200 times a second, so it tightens on a train and relaxes in an office instead of holding one aggressive setting. Eight hours per charge, thirty with the case, and a transparency mode that sounds like the world rather than a microphone.',
    price: 12999,
    compareAtPrice: 15999,
    tags: ['earbuds', 'anc', 'wireless', 'bluetooth'],
    options: [{ name: 'Color', values: ['Black', 'Ivory', 'Forest'] }],
    variants: [
      { optionValues: [colour('Black')], available: 78 },
      { optionValues: [colour('Ivory')], available: 41 },
      { optionValues: [colour('Forest')], available: 0 },
    ],
    specifications: [
      { name: 'Battery', value: '8h buds, 30h with case' },
      { name: 'ANC', value: 'Adaptive hybrid' },
      { name: 'Water resistance', value: 'IPX4' },
    ],
    isBestseller: true,
    weightGrams: 52,
  },
  {
    name: 'Lumen Field Speaker',
    brand: 'Lumen',
    category: 'Speakers',
    shortDescription: 'Portable speaker that survives being taken outside.',
    description:
      'IP67, so rain and sand are not a problem, and a passive radiator that gives it real low end for its size. Twenty hours at a sensible volume, and it charges other things over USB-C when someone inevitably runs out of phone battery.',
    price: 7499,
    compareAtPrice: 8999,
    tags: ['speaker', 'bluetooth', 'portable', 'waterproof'],
    stock: 34,
    specifications: [
      { name: 'Battery', value: '20 hours' },
      { name: 'Rating', value: 'IP67' },
      { name: 'Output', value: '30W' },
    ],
    weightGrams: 690,
  },

  // ── Fashion: Footwear ─────────────────────────────────────────────────────
  {
    name: 'Stride Meridian Runner',
    brand: 'Stride',
    category: "Men's Footwear",
    shortDescription: 'Daily trainer with a nitrogen-infused foam midsole.',
    description:
      'A neutral daily trainer for 30–80km weeks. The nitrogen-infused midsole is light without being unstable, and the outsole rubber is placed where it actually wears rather than everywhere, which keeps the weight down. Runs true to size with a slightly roomy toe box.',
    price: 11999,
    compareAtPrice: 13999,
    tags: ['running', 'shoes', 'training', 'neutral'],
    options: [
      { name: 'Color', values: ['Black', 'Cobalt', 'Coral'] },
      { name: 'Size', values: ['7', '8', '9', '10', '11'] },
    ],
    variants: [
      { optionValues: [colour('Black'), size('7')], available: 12 },
      { optionValues: [colour('Black'), size('8')], available: 28 },
      { optionValues: [colour('Black'), size('9')], available: 34 },
      { optionValues: [colour('Black'), size('10')], available: 19 },
      { optionValues: [colour('Black'), size('11')], available: 4, lowStockThreshold: 6 },
      { optionValues: [colour('Cobalt'), size('8')], available: 15 },
      { optionValues: [colour('Cobalt'), size('9')], available: 21 },
      { optionValues: [colour('Cobalt'), size('10')], available: 0 },
      { optionValues: [colour('Coral'), size('7')], available: 9 },
      { optionValues: [colour('Coral'), size('8')], available: 13 },
      { optionValues: [colour('Coral'), size('9')], available: 2, lowStockThreshold: 6 },
    ],
    specifications: [
      { name: 'Drop', value: '8mm' },
      { name: 'Weight', value: '246g (UK 9)' },
      { name: 'Use', value: 'Daily training, neutral gait' },
    ],
    isFeatured: true,
    isBestseller: true,
    weightGrams: 246,
  },
  {
    name: 'Stride Court Classic',
    brand: 'Stride',
    category: "Women's Footwear",
    shortDescription: 'Leather court sneaker that goes with everything.',
    description:
      'A low-profile court sneaker in full-grain leather with a rubber cupsole. Unlined at the heel so it breaks in rather than rubbing, and stitched rather than glued at the sole so it can be resoled.',
    price: 8999,
    tags: ['sneakers', 'leather', 'casual'],
    options: [
      { name: 'Color', values: ['White', 'Bone', 'Black'] },
      { name: 'Size', values: ['4', '5', '6', '7', '8'] },
    ],
    variants: [
      { optionValues: [colour('White'), size('5')], available: 22 },
      { optionValues: [colour('White'), size('6')], available: 31 },
      { optionValues: [colour('White'), size('7')], available: 18 },
      { optionValues: [colour('Bone'), size('5')], available: 8 },
      { optionValues: [colour('Bone'), size('6')], available: 14 },
      { optionValues: [colour('Bone'), size('7')], available: 3, lowStockThreshold: 6 },
      { optionValues: [colour('Black'), size('6')], available: 26 },
      { optionValues: [colour('Black'), size('7')], available: 17 },
      { optionValues: [colour('Black'), size('8')], available: 0 },
    ],
    specifications: [
      { name: 'Upper', value: 'Full-grain leather' },
      { name: 'Sole', value: 'Stitched rubber cupsole' },
    ],
    weightGrams: 380,
  },

  // ── Fashion: Clothing ─────────────────────────────────────────────────────
  {
    name: 'Meridian Heavyweight Tee',
    brand: 'Meridian',
    category: "Men's Clothing",
    shortDescription: '240gsm organic cotton, cut to keep its shape.',
    description:
      'A 240gsm organic cotton tee with a ribbed collar that does not go slack after a month. Pre-shrunk and garment-dyed, so what comes out of the first wash is what you keep.',
    price: 1899,
    compareAtPrice: 2499,
    tags: ['t-shirt', 'cotton', 'organic', 'basics'],
    options: [
      { name: 'Color', values: ['White', 'Black', 'Olive', 'Navy'] },
      { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    ],
    variants: [
      { optionValues: [colour('White'), size('S')], available: 40 },
      { optionValues: [colour('White'), size('M')], available: 65 },
      { optionValues: [colour('White'), size('L')], available: 52 },
      { optionValues: [colour('White'), size('XL')], available: 23 },
      { optionValues: [colour('Black'), size('M')], available: 71 },
      { optionValues: [colour('Black'), size('L')], available: 48 },
      { optionValues: [colour('Black'), size('XL')], available: 5, lowStockThreshold: 10 },
      { optionValues: [colour('Olive'), size('M')], available: 29 },
      { optionValues: [colour('Olive'), size('L')], available: 0 },
      { optionValues: [colour('Navy'), size('M')], available: 33 },
      { optionValues: [colour('Navy'), size('L')], available: 41 },
    ],
    specifications: [
      { name: 'Fabric', value: '240gsm organic cotton' },
      { name: 'Fit', value: 'Regular' },
      { name: 'Care', value: 'Machine wash cold, tumble dry low' },
    ],
    isBestseller: true,
    weightGrams: 220,
  },
  {
    name: 'Meridian Linen Shirt',
    brand: 'Meridian',
    category: "Women's Clothing",
    shortDescription: 'European linen, cut relaxed through the body.',
    description:
      'Made from washed European linen that starts soft instead of needing a season to get there. Relaxed through the body with a slightly dropped shoulder, and a single patch pocket. Linen creases — that is the point of linen.',
    price: 3499,
    tags: ['shirt', 'linen', 'summer'],
    options: [
      { name: 'Color', values: ['Ecru', 'Sky', 'Terracotta'] },
      { name: 'Size', values: ['XS', 'S', 'M', 'L'] },
    ],
    variants: [
      { optionValues: [colour('Ecru'), size('S')], available: 18 },
      { optionValues: [colour('Ecru'), size('M')], available: 24 },
      { optionValues: [colour('Ecru'), size('L')], available: 11 },
      { optionValues: [colour('Sky'), size('XS')], available: 7 },
      { optionValues: [colour('Sky'), size('S')], available: 16 },
      { optionValues: [colour('Sky'), size('M')], available: 2, lowStockThreshold: 5 },
      { optionValues: [colour('Terracotta'), size('S')], available: 13 },
      { optionValues: [colour('Terracotta'), size('M')], available: 0 },
    ],
    specifications: [
      { name: 'Fabric', value: '100% washed European linen' },
      { name: 'Fit', value: 'Relaxed' },
    ],
    isNewArrival: true,
    weightGrams: 190,
  },
  {
    name: 'Ridgeline Transit 32L',
    brand: 'Ridgeline',
    category: 'Bags & Luggage',
    shortDescription: 'Carry-on backpack that opens flat like a suitcase.',
    description:
      'A 32-litre clamshell backpack sized to every major carry-on allowance. Opens flat, so packing does not mean excavating. Padded 16-inch laptop sleeve accessible from the outside, and a separate compartment for shoes or laundry that does not steal space when empty.',
    price: 9999,
    compareAtPrice: 12499,
    tags: ['backpack', 'travel', 'carry-on', 'laptop'],
    options: [
      { name: 'Color', values: ['Black', 'Olive'] },
      { name: 'Material', values: ['Recycled Nylon', 'Waxed Canvas'] },
    ],
    variants: [
      { optionValues: [colour('Black'), material('Recycled Nylon')], available: 27 },
      { optionValues: [colour('Black'), material('Waxed Canvas')], priceDelta: 2500, available: 9 },
      { optionValues: [colour('Olive'), material('Recycled Nylon')], available: 14 },
      {
        optionValues: [colour('Olive'), material('Waxed Canvas')],
        priceDelta: 2500,
        available: 3,
        lowStockThreshold: 5,
      },
    ],
    specifications: [
      { name: 'Capacity', value: '32 litres' },
      { name: 'Laptop', value: 'Fits up to 16 inch' },
      { name: 'Dimensions', value: '55 × 35 × 22 cm' },
    ],
    isFeatured: true,
    weightGrams: 1300,
  },

  // ── Home & Kitchen ────────────────────────────────────────────────────────
  {
    name: 'Kettleworks Pour-Over Kettle',
    brand: 'Kettleworks',
    category: 'Kitchen Appliances',
    shortDescription: 'Variable-temperature gooseneck kettle with a 60-minute hold.',
    description:
      'A gooseneck kettle with one-degree temperature control and a hold that actually lasts an hour, so the second pour is the same temperature as the first. The spout is weighted to pour slowly without wrist strain, which is most of what separates a good pour-over from a bitter one.',
    price: 8499,
    tags: ['kettle', 'coffee', 'pour-over', 'kitchen'],
    options: [{ name: 'Color', values: ['Matte Black', 'Stainless'] }],
    variants: [
      { optionValues: [colour('Matte Black')], available: 31 },
      { optionValues: [colour('Stainless')], available: 19 },
    ],
    specifications: [
      { name: 'Capacity', value: '1 litre' },
      { name: 'Temperature range', value: '40°C – 100°C, 1° increments' },
      { name: 'Hold', value: '60 minutes' },
    ],
    isFeatured: true,
    isBestseller: true,
    weightGrams: 1400,
  },
  {
    name: 'Kettleworks Compact Air Fryer',
    brand: 'Kettleworks',
    category: 'Kitchen Appliances',
    shortDescription: '4.5L basket that fits under a standard cabinet.',
    description:
      'Sized to actually fit on a worktop under wall cabinets, which most air fryers do not. The basket is genuinely dishwasher-safe and the preheat is short enough that skipping it barely matters.',
    price: 6999,
    compareAtPrice: 8999,
    tags: ['air fryer', 'kitchen', 'appliance'],
    stock: 44,
    specifications: [
      { name: 'Capacity', value: '4.5 litres' },
      { name: 'Power', value: '1500W' },
      { name: 'Height', value: '28cm' },
    ],
    weightGrams: 4800,
  },
  {
    name: 'Terracotta Carbon Steel Pan',
    brand: 'Terracotta',
    category: 'Cookware',
    shortDescription: '26cm carbon steel, pre-seasoned, oven-safe to 260°C.',
    description:
      'Carbon steel heats like cast iron but weighs a third as much, and it builds a genuine non-stick patina with use. Ships pre-seasoned so the first cook works. Oven-safe to 260°C, induction compatible, and it will outlive every coated pan in the cupboard.',
    price: 3299,
    tags: ['pan', 'carbon steel', 'cookware', 'induction'],
    options: [{ name: 'Size', values: ['24cm', '26cm', '30cm'] }],
    variants: [
      { optionValues: [size('24cm')], priceDelta: -400, available: 26 },
      { optionValues: [size('26cm')], available: 38 },
      { optionValues: [size('30cm')], priceDelta: 700, available: 5, lowStockThreshold: 8 },
    ],
    specifications: [
      { name: 'Material', value: 'Carbon steel, 2.5mm' },
      { name: 'Oven safe', value: 'Up to 260°C' },
      { name: 'Hob', value: 'All including induction' },
    ],
    isBestseller: true,
    weightGrams: 1650,
  },
  {
    name: 'Haven Linen Duvet Set',
    brand: 'Haven',
    category: 'Home Decor',
    shortDescription: 'Stonewashed linen bedding that gets softer with washing.',
    description:
      'Stonewashed French flax linen, which breathes in summer and insulates in winter far better than cotton at the same weight. Comes as duvet cover plus two pillowcases, with coconut-shell buttons.',
    price: 8999,
    compareAtPrice: 11999,
    tags: ['bedding', 'linen', 'home'],
    options: [
      { name: 'Color', values: ['Oatmeal', 'Charcoal', 'Clay'] },
      { name: 'Size', values: ['Double', 'Queen', 'King'] },
    ],
    variants: [
      { optionValues: [colour('Oatmeal'), size('Double')], available: 12 },
      { optionValues: [colour('Oatmeal'), size('Queen')], priceDelta: 1500, available: 17 },
      { optionValues: [colour('Oatmeal'), size('King')], priceDelta: 3000, available: 8 },
      { optionValues: [colour('Charcoal'), size('Queen')], priceDelta: 1500, available: 11 },
      { optionValues: [colour('Charcoal'), size('King')], priceDelta: 3000, available: 0 },
      {
        optionValues: [colour('Clay'), size('Queen')],
        priceDelta: 1500,
        available: 4,
        lowStockThreshold: 6,
      },
    ],
    specifications: [
      { name: 'Material', value: '100% French flax linen' },
      { name: 'Weight', value: '165gsm' },
    ],
    isNewArrival: true,
    weightGrams: 2100,
  },

  // ── Beauty ────────────────────────────────────────────────────────────────
  {
    name: 'Botanic Lab Niacinamide Serum',
    brand: 'Botanic Lab',
    category: 'Skincare',
    shortDescription: '10% niacinamide with zinc, fragrance-free.',
    description:
      'A 10% niacinamide serum with 1% zinc PCA for oil control and visible pore refinement. Eight ingredients, no fragrance, no essential oils. Layers under moisturiser morning or night and plays well with almost everything except direct vitamin C application.',
    price: 899,
    tags: ['serum', 'niacinamide', 'skincare', 'fragrance-free'],
    options: [{ name: 'Size', values: ['30ml', '50ml'] }],
    variants: [
      { optionValues: [size('30ml')], available: 120 },
      { optionValues: [size('50ml')], priceDelta: 500, available: 64 },
    ],
    specifications: [
      { name: 'Key actives', value: '10% niacinamide, 1% zinc PCA' },
      { name: 'Skin type', value: 'All, including sensitive' },
      { name: 'Fragrance', value: 'None' },
    ],
    isFeatured: true,
    isBestseller: true,
    weightGrams: 90,
  },
  {
    name: 'Botanic Lab Ceramide Moisturiser',
    brand: 'Botanic Lab',
    category: 'Skincare',
    shortDescription: 'Barrier-repair cream with a 3:1:1 ceramide ratio.',
    description:
      'A straightforward barrier cream built on the 3:1:1 ceramide ratio found in healthy skin, plus cholesterol and fatty acids. Rich enough for winter, non-comedogenic, and it absorbs without the waxy film that usually comes with this much occlusive.',
    price: 1299,
    compareAtPrice: 1599,
    tags: ['moisturiser', 'ceramide', 'skincare', 'barrier'],
    stock: 88,
    specifications: [
      { name: 'Key actives', value: 'Ceramides NP/AP/EOP, cholesterol' },
      { name: 'Texture', value: 'Rich cream' },
    ],
    weightGrams: 110,
  },
  {
    name: 'Botanic Lab Repair Shampoo',
    brand: 'Botanic Lab',
    category: 'Haircare',
    shortDescription: 'Sulphate-free shampoo for colour-treated hair.',
    description:
      'Sulphate-free surfactants that clean without stripping colour, plus hydrolysed protein for hair that has been bleached or heat-damaged. It lathers less than a sulphate shampoo — that is expected, not a fault.',
    price: 749,
    tags: ['shampoo', 'sulphate-free', 'colour-treated'],
    options: [{ name: 'Size', values: ['250ml', '500ml'] }],
    variants: [
      { optionValues: [size('250ml')], available: 73 },
      { optionValues: [size('500ml')], priceDelta: 450, available: 12, lowStockThreshold: 15 },
    ],
    specifications: [
      { name: 'Formulation', value: 'Sulphate-free, silicone-free' },
      { name: 'Hair type', value: 'Colour-treated, damaged' },
    ],
    weightGrams: 280,
  },
  {
    name: 'Haven Cedar & Amber Candle',
    brand: 'Haven',
    category: 'Fragrance',
    shortDescription: 'Hand-poured soy wax, 55-hour burn.',
    description:
      'Cedar, amber and a little black pepper, in a soy-coconut wax blend that burns cleanly and evenly rather than tunnelling. Two cotton wicks so a 9cm vessel actually reaches a full melt pool.',
    price: 2199,
    tags: ['candle', 'home fragrance', 'soy wax'],
    // Deliberately sold out: without at least one fully out-of-stock product the
    // availability facet only ever has one bucket, and the "in stock only"
    // filter would appear to work while actually filtering nothing.
    stock: 0,
    specifications: [
      { name: 'Burn time', value: '55 hours' },
      { name: 'Wax', value: 'Soy-coconut blend' },
      { name: 'Notes', value: 'Cedar, amber, black pepper' },
    ],
    weightGrams: 400,
  },
];
