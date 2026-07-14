import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../listings/models/listing.dart';
import '../screens/browse_screen.dart';
import '../screens/home_screen.dart';
import '../screens/listing_detail_screen.dart';
import '../screens/listing_form_screen.dart';
import '../screens/login_screen.dart';
import '../screens/my_listings_screen.dart';
import '../screens/register_screen.dart';
import '../screens/watchlist_screen.dart';

class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefreshNotifier(ref);
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.isLoading) return null;
      final authenticated = auth.valueOrNull != null;
      final loggingIn =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';
      if (!authenticated && !loggingIn) return '/login';
      if (authenticated && loggingIn) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
      GoRoute(
        path: '/browse',
        builder: (context, state) => const BrowseScreen(),
      ),
      GoRoute(
        path: '/watchlist',
        builder: (context, state) => const WatchlistScreen(),
      ),
      // Literal segments must come before the /listings/:id family below —
      // go_router matches top-level routes in list order.
      GoRoute(
        path: '/listings/mine',
        builder: (context, state) => const MyListingsScreen(),
      ),
      GoRoute(
        path: '/listings/new',
        builder: (context, state) => const ListingFormScreen(),
      ),
      GoRoute(
        path: '/listings/:id/edit',
        builder: (context, state) =>
            ListingFormScreen(existing: state.extra as Listing?),
      ),
      GoRoute(
        path: '/listings/:id',
        builder: (context, state) =>
            ListingDetailScreen(listingId: state.pathParameters['id']!),
      ),
    ],
  );
});
