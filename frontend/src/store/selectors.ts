import type { RootState } from './index';

/**
 * Selectors for client state.
 *
 * There are no auth selectors here on purpose: the signed-in user is server
 * state and is read through `useAuth()` from `features/auth/api/queries`, which
 * is its single source of truth.
 *
 * `createSelector` is only needed where a selector *derives* a new value —
 * returning a fresh object or array from a plain selector makes `useSelector`
 * re-render on every dispatch, because the reference changes each time. The
 * selectors below all return primitives, so memoizing them would add machinery
 * for no benefit.
 */
export const selectUi = (state: RootState) => state.ui;
export const selectTheme = (state: RootState) => state.ui.theme;
export const selectCartDrawerOpen = (state: RootState) => state.ui.cartDrawerOpen;
export const selectMobileNavOpen = (state: RootState) => state.ui.mobileNavOpen;
export const selectMobileFilterOpen = (state: RootState) => state.ui.mobileFilterOpen;
export const selectSearchOpen = (state: RootState) => state.ui.searchOpen;
export const selectAdminSidebarCollapsed = (state: RootState) => state.ui.adminSidebarCollapsed;
