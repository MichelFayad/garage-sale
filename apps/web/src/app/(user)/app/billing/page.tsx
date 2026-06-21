import { PaymentMethodForm } from './PaymentMethodForm';

export default function BillingPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Payment method</h1>
      <p className="mt-2 mb-6 text-gray-600">
        Save a card to publish listings. Each published listing is charged a flat per-post fee.
      </p>
      <PaymentMethodForm />
    </section>
  );
}
