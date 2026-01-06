export interface PaymentProviderStatus {
  provider: string;
  configured: boolean;
  displayName: string;
}

export interface PaymentProviders {
  stripe: PaymentProviderStatus;
  paypal: PaymentProviderStatus;
  counter: PaymentProviderStatus;
}

export function getPaymentProviderStatus(): PaymentProviders {
  return {
    stripe: {
      provider: "stripe",
      configured: !!process.env.STRIPE_SECRET_KEY,
      displayName: "Card / Apple Pay / Google Pay",
    },
    paypal: {
      provider: "paypal",
      configured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
      displayName: "PayPal",
    },
    counter: {
      provider: "counter",
      configured: true,
      displayName: "Pay at Counter",
    },
  };
}

export function isProviderConfigured(provider: string): boolean {
  const status = getPaymentProviderStatus();
  switch (provider) {
    case "stripe":
    case "card":
    case "apple_pay":
    case "google_pay":
      return status.stripe.configured;
    case "paypal":
      return status.paypal.configured;
    case "counter":
    case "cash":
      return status.counter.configured;
    default:
      return false;
  }
}

export function getConfiguredProviders(): string[] {
  const status = getPaymentProviderStatus();
  const providers: string[] = [];
  if (status.stripe.configured) providers.push("stripe");
  if (status.paypal.configured) providers.push("paypal");
  if (status.counter.configured) providers.push("counter");
  return providers;
}

export const PAYMENT_METHODS = {
  STRIPE: ["card", "apple_pay", "google_pay"],
  PAYPAL: ["paypal"],
  COUNTER: ["cash", "counter"],
} as const;

export function getProviderForMethod(method: string): string | null {
  if (PAYMENT_METHODS.STRIPE.includes(method as any)) return "stripe";
  if (PAYMENT_METHODS.PAYPAL.includes(method as any)) return "paypal";
  if (PAYMENT_METHODS.COUNTER.includes(method as any)) return "counter";
  return null;
}
