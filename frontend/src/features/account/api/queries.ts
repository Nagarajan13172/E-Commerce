import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AddressInput, UpdateAddressInput } from '@ecom/shared';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import type { Address } from '@/types/cart';
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from './account.api';

export const accountKeys = {
  all: ['account'] as const,
  addresses: () => [...accountKeys.all, 'addresses'] as const,
};

export function useAddresses() {
  return useQuery({
    queryKey: accountKeys.addresses(),
    queryFn: fetchAddresses,
    staleTime: STALE_TIME.SHORT,
  });
}

/**
 * Every address mutation returns the full list.
 *
 * That is deliberate on the server side too: changing one address can change
 * another (promoting a new default when one is deleted), so returning only the
 * touched row would leave the cache inconsistent.
 */
function useAddressMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<Address[]>,
  successMessage: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (addresses) => {
      queryClient.setQueryData(accountKeys.addresses(), addresses);
      toast.success(successMessage);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    },
  });
}

export const useCreateAddress = () =>
  useAddressMutation((input: AddressInput) => createAddress(input), 'Address saved');

export const useUpdateAddress = () =>
  useAddressMutation(
    ({ id, input }: { id: string; input: UpdateAddressInput }) => updateAddress(id, input),
    'Address updated',
  );

export const useDeleteAddress = () =>
  useAddressMutation((id: string) => deleteAddress(id), 'Address removed');

export const useSetDefaultAddress = () =>
  useAddressMutation((id: string) => setDefaultAddress(id), 'Default address updated');
