import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import {
  uiReducer,
  setCartDrawerOpen,
  setMobileFilterOpen,
  closeAllOverlays,
  setTheme,
  toggleAdminSidebar,
} from '@/store/slices/uiSlice';
import { store as appStore } from '@/store';

function makeStore() {
  return configureStore({ reducer: { ui: uiReducer } });
}

/**
 * Redux holds client state only.
 *
 * Server state — products, cart, orders, wishlist and the signed-in user — is
 * owned by TanStack Query. These tests assert that boundary as much as they
 * assert behaviour: a slice that started fetching would break the first test
 * here.
 */
describe('store composition', () => {
  it('contains no server-state slices', () => {
    const state = appStore.getState();

    expect(Object.keys(state)).toEqual(['ui']);
    // The session in particular is fetched, not stored — mirroring it would
    // need an effect to stay in step and could disagree with the database.
    expect(state).not.toHaveProperty('auth');
    expect(state).not.toHaveProperty('products');
    expect(state).not.toHaveProperty('cart');
  });

  it('is synchronous and pure, so it needs no network to exercise', () => {
    const store = makeStore();

    store.dispatch(setCartDrawerOpen(true));
    store.dispatch(toggleAdminSidebar());

    expect(store.getState().ui.cartDrawerOpen).toBe(true);
    expect(store.getState().ui.adminSidebarCollapsed).toBe(true);
  });
});

describe('ui slice', () => {
  it('toggles the cart drawer', () => {
    const store = makeStore();

    store.dispatch(setCartDrawerOpen(true));
    expect(store.getState().ui.cartDrawerOpen).toBe(true);

    store.dispatch(setCartDrawerOpen(false));
    expect(store.getState().ui.cartDrawerOpen).toBe(false);
  });

  it('closes every overlay at once, for route changes', () => {
    const store = makeStore();
    store.dispatch(setCartDrawerOpen(true));
    store.dispatch(setMobileFilterOpen(true));

    store.dispatch(closeAllOverlays());

    const { cartDrawerOpen, mobileNavOpen, mobileFilterOpen, searchOpen } = store.getState().ui;
    // Without this, tapping a category inside the mobile menu leaves the menu
    // covering the page it just navigated to.
    expect([cartDrawerOpen, mobileNavOpen, mobileFilterOpen, searchOpen]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('persists the theme without throwing when storage is unavailable', () => {
    const store = makeStore();
    // Real condition: private windows and blocked-site-data settings make
    // localStorage *throw*, not merely return null.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage disabled');
    };

    expect(() => store.dispatch(setTheme('dark'))).not.toThrow();
    expect(store.getState().ui.theme).toBe('dark');

    Storage.prototype.setItem = original;
  });
});
