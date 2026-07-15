import 'package:flutter_stripe/flutter_stripe.dart';
import 'billing_repository.dart';

class CardSheetResult {
  const CardSheetResult({required this.ok, this.cancelled = false, this.error});
  final bool ok;
  final bool cancelled;
  final String? error;
}

/// Presents the native Stripe PaymentSheet in "setup" mode to collect a card
/// on file. Mirrors `apps/mobile/src/billing/useCardSheet.ts` from the old
/// RN app.
Future<CardSheetResult> presentCardSheet(
  BillingRepository repo,
  String accessToken,
) async {
  try {
    final clientSecret = await repo.createSetupIntent(accessToken);
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: 'Garage Sale',
      ),
    );
    await Stripe.instance.presentPaymentSheet();
    return const CardSheetResult(ok: true);
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) {
      return const CardSheetResult(ok: false, cancelled: true);
    }
    return CardSheetResult(
      ok: false,
      error: e.error.localizedMessage ?? e.error.message ?? 'Could not add card',
    );
  } catch (e) {
    return const CardSheetResult(ok: false, error: 'Could not start card setup');
  }
}
