import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/browse_controller.dart';
import '../listings/providers.dart';

class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key});

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  final _keywordController = TextEditingController();
  String? _categoryId;

  void _search() {
    ref.read(browseControllerProvider.notifier).applyFilters(
          keyword: _keywordController.text.isEmpty ? null : _keywordController.text,
          categoryId: _categoryId,
        );
  }

  @override
  Widget build(BuildContext context) {
    final listingsState = ref.watch(browseControllerProvider);
    final categoriesAsync = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Browse')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('keyword_field'),
                    controller: _keywordController,
                    decoration: const InputDecoration(labelText: 'Search'),
                  ),
                ),
                categoriesAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (error, _) => const SizedBox.shrink(),
                  data: (categories) => DropdownButton<String?>(
                    key: const Key('category_filter_dropdown'),
                    value: _categoryId,
                    hint: const Text('Category'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('All')),
                      ...categories.map(
                        (c) => DropdownMenuItem(value: c.id, child: Text(c.name)),
                      ),
                    ],
                    onChanged: (value) => setState(() => _categoryId = value),
                  ),
                ),
                IconButton(
                  key: const Key('search_button'),
                  icon: const Icon(Icons.search),
                  onPressed: _search,
                ),
              ],
            ),
          ),
          Expanded(
            child: listingsState.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => const Center(child: Text('Search failed')),
              data: (listings) {
                if (listings.isEmpty) {
                  return const Center(child: Text('No listings found'));
                }
                return ListView.builder(
                  itemCount: listings.length,
                  itemBuilder: (context, index) {
                    final listing = listings[index];
                    return ListTile(
                      key: Key('browse_tile_${listing.id}'),
                      title: Text(listing.title),
                      subtitle: Text(listing.categoryName ?? ''),
                      onTap: () => context.push('/listings/${listing.id}'),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
