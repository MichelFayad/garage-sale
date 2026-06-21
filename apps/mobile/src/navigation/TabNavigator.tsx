import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';

// Authenticated tab shell for the native User Portal. A lightweight custom tab
// bar (no extra nav deps) until P12 swaps in a full navigator with real screens.
type TabKey = 'home' | 'browse' | 'trades' | 'account';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'browse', label: 'Browse' },
  { key: 'trades', label: 'Trades' },
  { key: 'account', label: 'Account' },
];

export function TabNavigator() {
  const [tab, setTab] = useState<TabKey>('home');
  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'browse' && (
          <PlaceholderScreen
            title="Browse"
            subtitle="Search and filter listings by category, condition, and distance. Lands P12."
          />
        )}
        {tab === 'trades' && (
          <PlaceholderScreen
            title="Trades"
            subtitle="Proposals, messaging, and dual-confirm appear here. Lands P12."
          />
        )}
        {tab === 'account' && <AccountScreen />}
      </View>
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 12, color: '#888' },
  tabLabelActive: { color: '#111', fontWeight: '600' },
});
