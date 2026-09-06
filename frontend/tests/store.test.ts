import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { authReducer, sessionExpired, userUpdated } from '@/store/slices/authSlice';
import { uiReducer, setCartDrawerOpen, closeAllOverlays, setTheme } from '@/store/slices/uiSlice';
import { selectIsAuthResolving, selectIsStaff } from '@/store/selectors';
import type { RootState } from '@/store';
import type { AuthUser } from '@/store/slices/authSlice';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    name: 'Test Shopper',
    email: 'shopper@example.com',
    role: 'customer',
    emailVerified: true,
    marketingOptIn: false,
    permissions: [],
    createdAt: new Date('2026-01-01').toISOString(),
    ...overrides,
  };
}

function makeStore() {
  return configureStore({ reducer: { auth: authReducer, ui: uiReducer } });
}

describe('auth slice', () => {
  it('starts idle so guards wait instead of redirecting on a hard refresh', () => {
    const state = makeStore().getState() as RootState;

    expect(state.auth.status).toBe('idle');
    // The distinction that matters: "not yet known" is not "signed out".
    expect(selectIsAuthResolving(state)).toBe(true);
  });

  it('clears the user when the session expires', () => {
    const store = makeStore();
    store.dispatch(userUpdated(makeUser()));
    store.dispatch(sessionExpired());

    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('recognises staff roles for admin chrome', () => {
    const base = makeStore().getState() as RootState;

    const asCustomer: RootState = { ...base, auth: { ...base.auth, user: makeUser() } };
    const asManager: RootState = {
      ...base,
      auth: { ...base.auth, user: makeUser({ role: 'manager' }) },
    };

    expect(selectIsStaff(asCustomer)).toBe(false);
    expect(selectIsStaff(asManager)).toBe(true);
  });
});

describe('ui slice', () => {
  it('toggles the cart drawer', () => {
    const store = makeStore();
    store.dispatch(setCartDrawerOpen(true));
    expect(store.getState().ui.cartDrawerOpen).toBe(true);
  });

  it('closes every overlay at once, for route changes', () => {
    const store = makeStore();
    store.dispatch(setCartDrawerOpen(true));
    store.dispatch(closeAllOverlays());

    const { cartDrawerOpen, mobileNavOpen, mobileFilterOpen, searchOpen } = store.getState().ui;
    expect([cartDrawerOpen, mobileNavOpen, mobileFilterOpen, searchOpen]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('persists the theme without throwing when storage is unavailable', () => {
    const store = makeStore();
    // Simulate a browser that blocks site data — a real condition in private mode.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage disabled');
    };

    expect(() => store.dispatch(setTheme('dark'))).not.toThrow();
    expect(store.getState().ui.theme).toBe('dark');

    Storage.prototype.setItem = original;
  });
});
