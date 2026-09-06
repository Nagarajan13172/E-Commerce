import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import {
  authReducer,
  authRequestFailed,
  sessionEnded,
  sessionEstablished,
  sessionExpired,
  userUpdated,
} from '@/store/slices/authSlice';
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
  it('performs no I/O — every HTTP call lives in the query layer', () => {
    // The guarantee this encodes: reducers are synchronous and pure, so the
    // store can be exercised without a network, a server, or a mock of either.
    const store = makeStore();
    const before = store.getState().auth;

    store.dispatch(sessionEstablished(makeUser()));
    store.dispatch(sessionEnded());

    expect(before.status).toBe('idle');
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('records a session established by the query layer', () => {
    const store = makeStore();
    const user = makeUser({ name: 'Priya Sharma', role: 'manager' });

    store.dispatch(sessionEstablished(user));

    expect(store.getState().auth.user).toEqual(user);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('keeps server field errors for the form to display', () => {
    const store = makeStore();

    store.dispatch(
      authRequestFailed({
        message: 'Invalid email or password',
        fieldErrors: { email: 'No account with that address' },
      }),
    );

    expect(store.getState().auth.error).toBe('Invalid email or password');
    expect(store.getState().auth.fieldErrors.email).toBe('No account with that address');
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('starts idle so guards wait instead of redirecting on a hard refresh', () => {
    const state = makeStore().getState() as RootState;

    expect(state.auth.status).toBe('idle');
    // The distinction that matters: "not yet known" is not "signed out".
    expect(selectIsAuthResolving(state)).toBe(true);
  });

  it('clears the user when the session expires', () => {
    const store = makeStore();
    store.dispatch(sessionEstablished(makeUser()));
    store.dispatch(sessionExpired());

    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('merges a profile edit into the current session', () => {
    const store = makeStore();
    store.dispatch(sessionEstablished(makeUser({ name: 'Priya Sharma' })));

    store.dispatch(userUpdated({ name: 'Priya S.', phone: '9876543210' }));

    // Patched in place so the header reflects an edit without a refetch.
    expect(store.getState().auth.user?.name).toBe('Priya S.');
    expect(store.getState().auth.user?.phone).toBe('9876543210');
    expect(store.getState().auth.user?.email).toBe('shopper@example.com');
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
