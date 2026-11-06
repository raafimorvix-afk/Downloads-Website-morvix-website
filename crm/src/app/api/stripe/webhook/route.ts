import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { anonClient } from "@/lib/supabase/anon";

// Stripe calls this when a payment link is paid. Signature-checked; only then is the server secret used.
export async function POST(request: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!s || !secret.startsWith("whsec_")) return new Response("Stripe not configured", { status: 503 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid" || !session.payment_link) return Response.json({ ignored: true });
    const linkId = typeof session.payment_link === "string" ? session.payment_link : session.payment_link.id;
    const link = await s.paymentLinks.retrieve(linkId);
    const ours = link.metadata?.morvix_link_id;
    if (!ours) return Response.json({ ignored: "not a CRM link" });
    const { error } = await anonClient().rpc("server_mark_paid", { p_secret: process.env.SERVER_SECRET ?? "", p_link: ours, p_session: session.id });
    if (error) return new Response("Could not mark paid", { status: 500 }); // Stripe retries
  }
  return Response.json({ received: true });
}
