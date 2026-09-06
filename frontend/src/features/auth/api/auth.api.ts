import { apiGet, apiPost } from '@/lib/apiClient';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@ecom/shared';
import type { UserRole } from '@ecom/shared';

/**
 * Every auth HTTP call lives here.
 *
 * The store never talks to the network — see `features/auth/api/queries.ts` for
 * the hooks that call these, and `store/slices/authSlice.ts` for the state they
 * produce.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  emailVerified: boolean;
  marketingOptIn: boolean;
  permissions: string[];
  createdAt: string;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const { user } = await apiGet<{ user: AuthUser }>('/auth/me');
  return user;
}

export async function login(credentials: LoginInput): Promise<AuthUser> {
  const { user } = await apiPost<{ user: AuthUser }>('/auth/login', credentials);
  return user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const { user } = await apiPost<{ user: AuthUser }>('/auth/register', input);
  return user;
}

export async function logout(): Promise<void> {
  // Failures are swallowed: the local session must be cleared either way, or
  // the UI would claim the user is signed in when they believe they are not.
  await apiPost('/auth/logout').catch(() => undefined);
}

export async function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
  const { user } = await apiPost<{ user: AuthUser }>('/auth/profile', input);
  return user;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiPost('/auth/change-password', input);
}

export async function resendVerification(email: string): Promise<void> {
  await apiPost('/auth/resend-verification', { email }).catch(() => undefined);
}
