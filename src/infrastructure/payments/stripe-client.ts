import Stripe from 'stripe';

let instance: Stripe | null = null;

export function getStripeClient(secretKey: string): Stripe {
  if (!instance) {
    instance = new Stripe(secretKey, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return instance;
}

export function resetStripeClient(): void {
  instance = null;
}
