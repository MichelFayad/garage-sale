import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { NavProvider, useNav } from './NavContext';
import { TABS, type Route } from './routes';
import { HomeScreen } from '../screens/HomeScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { BrowseScreen } from '../screens/BrowseScreen';
import { ListingDetailScreen } from '../screens/ListingDetailScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { colors } from '../components/ui';

// Authenticated shell: a lightweight custom tab bar over an in-memory screen
// stack (NavProvider) — no third-party navigator. The header shows a back affordance
// when the current tab has pushed screens; tapping a tab resets that tab's stack.

const TITLES: Record<Route['name'], string> = {
  home: 'Garage Sale',
  browse: 'Browse',
  listingDetail: 'Listing',
  trades: 'Trades',
  account: 'Account',
};

function renderRoute(route: Route) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'browse':
      return <BrowseScreen />;
    case 'listingDetail':
      return <ListingDetailScreen id={route.id} />;
    case 'trades':
      return (
        <PlaceholderScreen
          title="Trades"
          subtitle="Proposals, messaging, and dual-confirm land in the next P12 stage."
        />
      );
    case 'account':
      return <AccountScreen />;
  }
}

function Shell() {
  const { route, tab, canGoBack, pop, switchTab } = useNav();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {canGoBack ? (
          <Pressable accessibilityRole="button" onPress={pop} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {TITLES[route.name]}
        </Text>
        <View style={styles.back} />
      </View>

      <View style={styles.screen}>{renderRoute(route)}</View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => switchTab(t.key)}>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export function TabNavigator() {
  return (
    <NavProvider>
      <Shell />
    </NavProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { width: 64 },
  backText: { color: colors.accent, fontSize: 16 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#fafafa',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 12, color: colors.faint },
  tabLabelActive: { color: colors.text, fontWeight: '600' },
});
