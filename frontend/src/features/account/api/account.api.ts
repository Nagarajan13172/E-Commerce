import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient';
import type { AddressInput, UpdateAddressInput } from '@ecom/shared';
import type { Address } from '@/types/cart';

export async function fetchAddresses(): Promise<Address[]> {
  const { addresses } = await apiGet<{ addresses: Address[] }>('/account/addresses');
  return addresses;
}

export async function createAddress(input: AddressInput): Promise<Address[]> {
  const { addresses } = await apiPost<{ addresses: Address[] }>('/account/addresses', input);
  return addresses;
}

export async function updateAddress(id: string, input: UpdateAddressInput): Promise<Address[]> {
  const { addresses } = await apiPatch<{ addresses: Address[] }>(`/account/addresses/${id}`, input);
  return addresses;
}

export async function deleteAddress(id: string): Promise<Address[]> {
  const { addresses } = await apiDelete<{ addresses: Address[] }>(`/account/addresses/${id}`);
  return addresses;
}

export async function setDefaultAddress(
  id: string,
  kind: 'shipping' | 'billing' = 'shipping',
): Promise<Address[]> {
  const { addresses } = await apiPost<{ addresses: Address[] }>(
    `/account/addresses/${id}/default?kind=${kind}`,
  );
  return addresses;
}
