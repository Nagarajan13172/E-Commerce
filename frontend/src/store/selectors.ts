import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';

/**
 * Memoized selectors.
 *
 * `createSelector` matters wherever a selector derives a new value: returning a
 * fresh object or array from a plain selector makes `useSelector` re-render on
 * *every* dispatch, because the reference changes each time even when nothing
 * relevant did.
 */
export const selectAuthUser = (state: RootState) => state.auth.user;
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectAuthFieldErrors = (state: RootState) => state.auth.fieldErrors;

export const selectIsAuthenticated = (state: RootState) => state.auth.status === 'authenticated';

/** True until the first `/auth/me` settles — guards must wait, not redirect. */
export const selectIsAuthResolving = (state: RootState) =>
  state.auth.status === 'idle' || state.auth.status === 'loading';

export const selectIsStaff = createSelector([selectAuthUser], (user) =>
  user ? ['support', 'manager', 'admin'].includes(user.role) : false,
);

/**
 * Permission check for hiding controls the user cannot use.
 *
 * Presentation only. The server re-checks every request, so a tampered store
 * reveals a button, not an ability.
 */
export const selectHasPermission = createSelector(
  [selectAuthUser, (_state: RootState, permission: string) => permission],
  (user, permission) => user?.permissions.includes(permission) ?? false,
);

export const selectUi = (state: RootState) => state.ui;
export const selectTheme = (state: RootState) => state.ui.theme;
export const selectCartDrawerOpen = (state: RootState) => state.ui.cartDrawerOpen;
export const selectMobileNavOpen = (state: RootState) => state.ui.mobileNavOpen;
export const selectMobileFilterOpen = (state: RootState) => state.ui.mobileFilterOpen;
export const selectAdminSidebarCollapsed = (state: RootState) => state.ui.adminSidebarCollapsed;
