import "server-only";
import Stripe from "stripe";

/** null until the owner pastes the real key into Vercel (placeholder values don't count). */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!/^(sk|rk)_(live|test)_/.test(key)) return null;
  return new Stripe(key);
}
export const stripeMode = () => (process.env.STRIPE_SECRET_KEY ?? "").includes("_test_") ? "test" : "live";
