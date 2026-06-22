import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useNav } from '../navigation/NavContext';
import { Card, colors } from '../components/ui';

// Home tab — authenticated dashboard with quick links into the User Portal.
export function HomeScreen() {
  const { user } = useAuth();
  const { push, switchTab } = useNav();

  const links: { title: string; subtitle: string; onPress(): void }[] = [
    {
      title: 'Browse listings',
      subtitle: 'Find items to trade for',
      onPress: () => switchTab('browse'),
    },
    {
      title: 'My listings',
      subtitle: 'Create and manage your posts',
      onPress: () => push({ name: 'myListings' }),
    },
    {
      title: 'Watchlist',
      subtitle: 'Listings you are following',
      onPress: () => push({ name: 'watchlist' }),
    },
    { title: 'Trades', subtitle: 'Proposals and messages', onPress: () => switchTab('trades') },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome, {user?.displayName}</Text>
      <View style={styles.grid}>
        {links.map((l) => (
          <Card key={l.title} onPress={l.onPress}>
            <Text style={styles.cardTitle}>{l.title}</Text>
            <Text style={styles.cardSubtitle}>{l.subtitle}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text },
  grid: { gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.muted },
});
