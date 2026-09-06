import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserRole } from '@ecom/shared';

/**
 * Session state.
 *
 * Pure state, by design: this slice performs **no I/O**. Every auth HTTP call
 * lives in `features/auth/api/`, is executed by TanStack Query, and is committed
 * here through the plain reducers below. That keeps caching, retries and
 * request de-duplication in one place, and application state in another.
 *
 * Tokens are deliberately absent. They live in httpOnly cookies the app cannot
 * read — which is exactly what makes them safe from XSS — so "am I signed in?"
 * is answered by asking the server, not by inspecting the store.
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

/**
 * `idle` is not the same as `unauthenticated`.
 *
 * Before the first `/auth/me` settles we genuinely do not know, and route
 * guards must wait rather than bounce a valid session to the login page on
 * every hard refresh.
 */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** Server-side field errors, keyed by form field. */
  fieldErrors: Record<string, string>;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
  fieldErrors: {},
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** A sign-in, registration or session restore succeeded. */
    sessionEstablished(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
      state.error = null;
      state.fieldErrors = {};
    },

    /** Signed out, or the server confirmed there is no session. */
    sessionEnded(state) {
      state.user = null;
      state.status = 'unauthenticated';
      state.error = null;
      state.fieldErrors = {};
    },

    /** Called by the axios interceptor when a token refresh fails. */
    sessionExpired(state) {
      state.user = null;
      state.status = 'unauthenticated';
      state.error = null;
    },

    authRequestStarted(state) {
      state.status = 'loading';
      state.error = null;
      state.fieldErrors = {};
    },

    authRequestFailed(
      state,
      action: PayloadAction<{ message: string; fieldErrors: Record<string, string> }>,
    ) {
      state.status = 'unauthenticated';
      state.error = action.payload.message;
      state.fieldErrors = action.payload.fieldErrors;
    },

    /** The session lookup itself failed (network, 500) — not a sign-out. */
    authFailed(state) {
      state.user = null;
      state.status = 'unauthenticated';
    },

    clearAuthError(state) {
      state.error = null;
      state.fieldErrors = {};
    },

    /** Applied after a profile edit so the header updates immediately. */
    userUpdated(state, action: PayloadAction<Partial<AuthUser>>) {
      if (state.user) state.user = { ...state.user, ...action.payload };
    },
  },
});

export const {
  sessionEstablished,
  sessionEnded,
  sessionExpired,
  authRequestStarted,
  authRequestFailed,
  authFailed,
  clearAuthError,
  userUpdated,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
