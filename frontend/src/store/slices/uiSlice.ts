import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Ephemeral interface state.
 *
 * What belongs here: things that are genuinely global to the UI and have no
 * server counterpart — which drawer is open, whether the admin sidebar is
 * collapsed, the chosen theme.
 *
 * What does NOT belong here: anything the server owns. Products, the cart,
 * orders and wishlists are all *server* state; mirroring them into Redux means
 * maintaining a second copy that can disagree with the database, and inventing
 * cache invalidation by hand. Those live in the data layer instead.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export interface UiState {
  cartDrawerOpen: boolean;
  mobileNavOpen: boolean;
  mobileFilterOpen: boolean;
  searchOpen: boolean;
  adminSidebarCollapsed: boolean;
  theme: ThemeMode;
}

const THEME_STORAGE_KEY = 'aurora.theme';

/**
 * Theme is the one slice of UI state worth persisting, because getting it wrong
 * is visible: a dark-mode user would see a white flash on every page load.
 * Reading it is wrapped because storage access throws outright in some
 * privacy configurations rather than merely returning null.
 */
function loadTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage unavailable (private mode, blocked cookies) — fall through.
  }
  return 'system';
}

const initialState: UiState = {
  cartDrawerOpen: false,
  mobileNavOpen: false,
  mobileFilterOpen: false,
  searchOpen: false,
  adminSidebarCollapsed: false,
  theme: loadTheme(),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setCartDrawerOpen(state, action: PayloadAction<boolean>) {
      state.cartDrawerOpen = action.payload;
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setMobileFilterOpen(state, action: PayloadAction<boolean>) {
      state.mobileFilterOpen = action.payload;
    },
    setSearchOpen(state, action: PayloadAction<boolean>) {
      state.searchOpen = action.payload;
    },
    toggleAdminSidebar(state) {
      state.adminSidebarCollapsed = !state.adminSidebarCollapsed;
    },
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      } catch {
        // Non-fatal: the theme simply will not survive a reload.
      }
    },
    /** Close every overlay — used on route change so none survive navigation. */
    closeAllOverlays(state) {
      state.cartDrawerOpen = false;
      state.mobileNavOpen = false;
      state.mobileFilterOpen = false;
      state.searchOpen = false;
    },
  },
});

export const {
  setCartDrawerOpen,
  setMobileNavOpen,
  setMobileFilterOpen,
  setSearchOpen,
  toggleAdminSidebar,
  setTheme,
  closeAllOverlays,
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;
