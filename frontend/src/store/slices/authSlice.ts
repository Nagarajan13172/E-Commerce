import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { apiGet, apiPost, ApiError } from '@/lib/apiClient';
import type { LoginInput, RegisterInput, UserRole } from '@ecom/shared';

/**
 * Session state.
 *
 * A deliberately narrow slice: it holds *who the user is*, not their data. The
 * tokens themselves are never here — they live in httpOnly cookies that this
 * code cannot read by design, which is what makes them safe from XSS. So the
 * store holds only the profile the server chose to disclose, and "am I signed
 * in" is answered by asking the server, not by inspecting a token.
 *
 * `status: 'idle'` vs `'unauthenticated'` is a meaningful distinction: before
 * the first `/auth/me` resolves we do not yet know, and route guards must wait
 * rather than bouncing a signed-in user to the login page on a hard refresh.
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

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** Field-level errors from the server, keyed by form field. */
  fieldErrors: Record<string, string>;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
  fieldErrors: {},
};

/**
 * Restore the session on boot.
 *
 * The cookie is httpOnly, so the only way to know whether it is still valid is
 * to ask. A 401 here is a normal outcome (a signed-out visitor), not an error
 * worth surfacing.
 */
export const fetchCurrentUser = createAsyncThunk<
  AuthUser | null,
  void,
  { state: { auth: AuthState } }
>(
  'auth/fetchCurrentUser',
  async () => {
    try {
      const { user } = await apiGet<{ user: AuthUser }>('/auth/me');
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  {
    // Skip while a fetch is already in flight. React StrictMode double-invokes
    // effects in development, and thunks — unlike React Query — do not dedupe
    // on their own.
    condition: (_arg, { getState }) => getState().auth.status !== 'loading',
  },
);

export const login = createAsyncThunk<
  AuthUser,
  LoginInput,
  { rejectValue: { message: string; fieldErrors: Record<string, string> } }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { user } = await apiPost<{ user: AuthUser }>('/auth/login', credentials);
    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      return rejectWithValue({ message: error.message, fieldErrors: error.fieldErrorMap });
    }
    throw error;
  }
});

export const register = createAsyncThunk<
  AuthUser,
  RegisterInput,
  { rejectValue: { message: string; fieldErrors: Record<string, string> } }
>('auth/register', async (input, { rejectWithValue }) => {
  try {
    const { user } = await apiPost<{ user: AuthUser }>('/auth/register', input);
    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      return rejectWithValue({ message: error.message, fieldErrors: error.fieldErrorMap });
    }
    throw error;
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  // Errors are swallowed on purpose: if the call fails the local session must
  // still be cleared, or the UI would claim the user is signed in when they
  // believe they are not.
  await apiPost('/auth/logout').catch(() => undefined);
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Called by the axios interceptor when a token refresh fails. */
    sessionExpired(state) {
      state.user = null;
      state.status = 'unauthenticated';
      state.error = null;
    },
    clearAuthError(state) {
      state.error = null;
      state.fieldErrors = {};
    },
    /** Applied after a profile update so the header reflects it immediately. */
    userUpdated(state, action: PayloadAction<Partial<AuthUser>>) {
      if (state.user) state.user = { ...state.user, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = action.payload ? 'authenticated' : 'unauthenticated';
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.status = 'unauthenticated';
      })

      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.fieldErrors = {};
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
        state.error = null;
        state.fieldErrors = {};
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload?.message ?? 'Unable to sign in. Please try again.';
        state.fieldErrors = action.payload?.fieldErrors ?? {};
      })

      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.fieldErrors = {};
      })
      .addCase(register.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload?.message ?? 'Unable to create your account.';
        state.fieldErrors = action.payload?.fieldErrors ?? {};
      })

      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = 'unauthenticated';
        state.error = null;
        state.fieldErrors = {};
      });
  },
});

export const { sessionExpired, clearAuthError, userUpdated } = authSlice.actions;
export const authReducer = authSlice.reducer;
