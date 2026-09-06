import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, RootState } from './index';

/**
 * Pre-typed Redux hooks.
 *
 * Always use these instead of the bare `useDispatch` / `useSelector`: the plain
 * versions type state as `unknown` and lose the thunk signature on dispatch, so
 * `dispatch(login(...))` would not typecheck and selectors would need a manual
 * annotation at every call site.
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
