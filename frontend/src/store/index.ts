import { configureStore } from '@reduxjs/toolkit';
import { uiReducer } from './slices/uiSlice';
import { authReducer } from './slices/authSlice';

/**
 * Redux Toolkit store.
 *
 * Scope is deliberate: **client state only** — session identity and interface
 * state. Server-owned data (products, cart, orders) is not mirrored here.
 * Copying it into Redux would mean hand-rolling caching, deduplication,
 * revalidation and invalidation, and living with a second copy of the truth
 * that can silently disagree with the database.
 */
export const store = configureStore({
  reducer: {
    ui: uiReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // The serializability check is genuinely valuable — it is what stops a
      // Date, a Map or an axios error object being put in the store, which
      // would break time-travel debugging and state persistence.
      serializableCheck: true,
      immutableCheck: true,
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
