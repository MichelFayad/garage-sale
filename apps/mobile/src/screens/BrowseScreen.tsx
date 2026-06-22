// Browse tab — discover ACTIVE listings with keyword + category/condition/type
// filters, mirroring the web browse page. Tapping a result opens its detail.
// (Location-radius filtering needs device geolocation — deferred to a later stage.)

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import { Badge, Card, ErrorText, colors } from '../components/ui';

type Category = { id: string; name: string };
type Listing = Awaited<ReturnType<typeof trpc.browse.search.query>>[number];

const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'] as const;
const TYPES = ['HAVE', 'WANT'] as const;

export function BrowseScreen() {
  const { push } = useNav();
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number] | undefined>();
  const [type, setType] = useState<(typeof TYPES)[number] | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.listings.categories
      .query()
      .then((cats) => setCategories(cats.map((c) => ({ id: c.id, name: c.name }))));
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await trpc.browse.search.query({
        keyword: keyword.trim() || undefined,
        categoryId,
        condition,
        type,
      });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [keyword, categoryId, condition, type]);

  // Re-run on filter chip changes; keyword search is submit-driven (onSubmitEditing).
  useEffect(() => {
    void search();
  }, [categoryId, condition, type]);

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder="Search listings…"
          placeholderTextColor={colors.faint}
          value={keyword}
          onChangeText={setKeyword}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
        />
        <FilterRow
          label="Type"
          options={TYPES.map((t) => ({ value: t, label: t }))}
          selected={type}
          onSelect={(v) => setType(v as (typeof TYPES)[number] | undefined)}
        />
        <FilterRow
          label="Condition"
          options={CONDITIONS.map((c) => ({ value: c, label: c.replace('_', ' ') }))}
          selected={condition}
          onSelect={(v) => setCondition(v as (typeof CONDITIONS)[number] | undefined)}
        />
        {categories.length > 0 && (
          <FilterRow
            label="Category"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            selected={categoryId}
            onSelect={setCategoryId}
          />
        )}
      </View>

      {error && <ErrorText>{error}</ErrorText>}

      <FlatList
        data={results}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => void search()}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No listings match these filters.</Text>
        }
        renderItem={({ item }) => (
          <Card onPress={() => push({ name: 'listingDetail', id: item.id })}>
            <View style={styles.row}>
              {item.photos[0] ? (
                <Image source={{ uri: item.photos[0].url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.category.name} · {item.condition.replace('_', ' ')}
                </Text>
                {item.city ? <Text style={styles.meta}>{item.city}</Text> : null}
                <Badge label={item.type} tone="accent" />
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | undefined;
  onSelect(value: string | undefined): void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={options}
        keyExtractor={(o) => o.value}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => {
          const active = selected === item.value;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(active ? undefined : item.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: {
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  filterRow: { gap: 4 },
  filterLabel: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  chips: { gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, color: colors.muted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
