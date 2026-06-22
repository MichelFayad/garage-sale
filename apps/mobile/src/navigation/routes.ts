// Route model for the native User Portal. A single in-memory stack (no extra nav
// deps — see TabNavigator) keyed by tab; switching tabs resets to that tab's root.
// Screens are added to the union as each P12 stage lands.

export type Route =
  | { name: 'home' }
  | { name: 'browse' }
  | { name: 'listingDetail'; id: string }
  | { name: 'myListings' }
  | { name: 'listingForm'; id?: string }
  | { name: 'watchlist' }
  | { name: 'trades' }
  | { name: 'account' };

export type TabKey = 'home' | 'browse' | 'trades' | 'account';

export const TAB_ROOTS: Record<TabKey, Route> = {
  home: { name: 'home' },
  browse: { name: 'browse' },
  trades: { name: 'trades' },
  account: { name: 'account' },
};

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'browse', label: 'Browse' },
  { key: 'trades', label: 'Trades' },
  { key: 'account', label: 'Account' },
];
