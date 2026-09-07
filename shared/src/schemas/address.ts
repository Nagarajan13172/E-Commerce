import { z } from 'zod';
import { phoneSchema, toUpdateSchema } from './common.js';
import { ADDRESS_LABELS } from '../constants/enums.js';

export const addressSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default('home'),
  fullName: z.string().trim().min(2, 'Full name is required').max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(4, 'Address is required').max(120),
  line2: z.string().trim().max(120).optional().or(z.literal('')),
  landmark: z.string().trim().max(80).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'City is required').max(60),
  state: z.string().trim().min(2, 'State is required').max(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{4,10}$/, 'Enter a valid postal code'),
  country: z.string().trim().min(2).max(60).default('India'),
  isDefaultShipping: z.boolean().default(false),
  isDefaultBilling: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
export type AddressFormValues = z.input<typeof addressSchema>;

export const updateAddressSchema = toUpdateSchema(addressSchema);
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
