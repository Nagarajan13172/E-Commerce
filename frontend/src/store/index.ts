import { configureStore } from '@reduxjs/toolkit';
import { uiReducer } from './slices/uiSlice';

/**
 * Redux Toolkit store — **client state only**.
 *
 * The division of responsibility across the app:
 *
 *   TanStack Query  server state: anything that lives in the database and is
 *                   fetched over HTTP — products, cart, orders, wishlist, and
 *                   the signed-in user.
 *   Redux Toolkit   client state: things the server has no opinion about —
 *                   which drawer is open, the chosen theme, and (from the
 *                   checkout work) the multi-step wizard's local progress.
 *
 * Nothing fetched is copied in here. A mirror of server data would need an
 * effect to keep it in step and could silently disagree with the database,
 * which is the failure mode this split exists to prevent.
 */
export const store = configureStore({
  reducer: {
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Genuinely valuable: this is what stops a Date, a Map or an axios error
      // object being put in the store, which would break time-travel debugging
      // and any future state persistence.
      serializableCheck: true,
      immutableCheck: true,
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
