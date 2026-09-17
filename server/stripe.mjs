// Stripe Checkout + webhooks for web Gold Patrol. Native StoreKit stays separate.

import Stripe from "stripe";
import { cutOrigin } from "./clip-inbox.mjs";

const PRICE_ENV = {
  monthly: "STRIPE_PRICE_MONTHLY",
  yearly: "STRIPE_PRICE_YEARLY",
};

const PRODUCT_BY_PRICE = new Map();

export const STRIPE_PRODUCT_IDS = {
  monthly: "stripe.gold_patrol.monthly",
  yearly: "stripe.gold_patrol.yearly",
};

let stripeClient = null;

export function billingConfigured(env = process.env) {
  return !!(
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_PRICE_MONTHLY &&
    env.STRIPE_PRICE_YEARLY
  );
}

export function getStripe(env = process.env) {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function refreshPriceMap(env = process.env) {
  PRODUCT_BY_PRICE.clear();
  if (env.STRIPE_PRICE_MONTHLY) {
    PRODUCT_BY_PRICE.set(env.STRIPE_PRICE_MONTHLY, STRIPE_PRODUCT_IDS.monthly);
  }
  if (env.STRIPE_PRICE_YEARLY) {
    PRODUCT_BY_PRICE.set(env.STRIPE_PRICE_YEARLY, STRIPE_PRODUCT_IDS.yearly);
  }
}

export function priceIdForPlan(plan, env = process.env) {
  const key = PRICE_ENV[plan];
  if (!key) return null;
  const id = env[key];
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function productIdForStripePrice(priceId, env = process.env) {
  refreshPriceMap(env);
  return PRODUCT_BY_PRICE.get(priceId) ?? null;
}

export function billingPublicConfig(env = process.env) {
  const enabled = billingConfigured(env);
  return {
    stripeCheckout: enabled,
    monthly: {
      plan: "monthly",
      displayAmount: env.STRIPE_DISPLAY_MONTHLY ?? "$1.99",
      interval: "month",
    },
    yearly: {
      plan: "yearly",
      displayAmount: env.STRIPE_DISPLAY_YEARLY ?? "$14.99",
      interval: "year",
    },
  };
}

const ACTIVEISH = new Set(["active", "trialing", "past_due"]);

/**
 * Map a Stripe subscription object to premium fields, or null to clear web entitlement.
 * Pure: safe for unit tests without Stripe network calls.
 */
export function entitlementFromStripeSubscription(sub, env = process.env) {
  if (!sub || typeof sub !== "object") return null;
  const status = sub.status;
  const periodEnd = Number(sub.current_period_end || 0);
  const untilMs = Number.isFinite(periodEnd) && periodEnd > 0 ? periodEnd * 1000 : 0;

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? sub.plan?.id ?? null;
  const productId = priceId ? productIdForStripePrice(priceId, env) : null;

  if (ACTIVEISH.has(status) && untilMs > Date.now() && productId) {
    return {
      until: untilMs,
      productId,
      transactionId: String(sub.id ?? ""),
      source: "stripe",
    };
  }

  if ((status === "canceled" || status === "unpaid") && untilMs > Date.now() && productId) {
    return {
      until: untilMs,
      productId,
      transactionId: String(sub.id ?? ""),
      source: "stripe",
    };
  }

  if (untilMs > Date.now() && productId) {
    return {
      until: untilMs,
      productId,
      transactionId: String(sub.id ?? ""),
      source: "stripe",
    };
  }

  return { until: 0, productId: null, transactionId: null, source: null };
}

export async function ensureStripeCustomer(stripe, user, store) {
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }
  const customer = await stripe.customers.create({
    metadata: { orion_user_id: String(user.id) },
    name: user.callsign,
  });
  store.setStripeCustomerId(user.id, customer.id);
  return customer.id;
}

export async function createCheckoutSession({ stripe, user, plan, req, store, env = process.env }) {
  const priceId = priceIdForPlan(plan, env);
  if (!priceId) throw new Error("invalid plan");
  const customerId = await ensureStripeCustomer(stripe, user, store);
  const origin = cutOrigin(req, env);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(user.id),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancel`,
    metadata: { orion_user_id: String(user.id), plan },
  });
  return session;
}

export async function createPortalSession({ stripe, user, req, env = process.env }) {
  if (!user.stripe_customer_id) throw new Error("no stripe customer");
  const origin = cutOrigin(req, env);
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/`,
  });
  return session;
}

/**
 * Apply a verified Stripe webhook event. Returns a short log line or null.
 */
export async function applyStripeWebhookEvent(event, { store, stripe, env = process.env }) {
  const type = event?.type;
  if (!type) return null;

  if (type === "checkout.session.completed") {
    const session = event.data?.object;
    if (session?.mode !== "subscription") return "checkout ignored (not subscription)";
    const userId = Number(session.client_reference_id || session.metadata?.orion_user_id);
    if (!Number.isFinite(userId)) return "checkout missing user";
    const subId = session.subscription;
    if (!subId || !stripe) return "checkout missing subscription";
    const sub = await stripe.subscriptions.retrieve(String(subId));
    const ent = entitlementFromStripeSubscription(sub, env);
    if (!ent) return "checkout subscription not entitled";
    store.setUserPremium(userId, ent);
    if (session.customer && typeof session.customer === "string") {
      store.setStripeCustomerId(userId, session.customer);
    }
    return `checkout.session.completed user=${userId}`;
  }

  if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const sub = event.data?.object;
    const customerId = sub?.customer;
    if (!customerId) return "subscription missing customer";
    const user = store.getUserByStripeCustomerId(String(customerId));
    if (!user) {
      const userId = Number(sub.metadata?.orion_user_id);
      if (!Number.isFinite(userId)) return "subscription user not found";
      const ent = entitlementFromStripeSubscription(sub, env);
      if (ent?.until) store.setUserPremium(userId, ent);
      else store.setUserPremium(userId, { until: 0, productId: null, transactionId: null, source: null });
      return `${type} user=${userId} (metadata)`;
    }
    const ent = entitlementFromStripeSubscription(sub, env);
    if (ent?.until) {
      store.setUserPremium(user.id, ent);
    } else {
      store.setUserPremium(user.id, {
        until: 0,
        productId: null,
        transactionId: null,
        source: null,
      });
    }
    return `${type} user=${user.id}`;
  }

  if (type === "invoice.paid") {
    const invoice = event.data?.object;
    const subId = invoice?.subscription;
    if (!subId || !stripe) return "invoice.paid ignored";
    const sub = await stripe.subscriptions.retrieve(String(subId));
    const customerId = sub.customer;
    const user =
      store.getUserByStripeCustomerId(String(customerId)) ??
      (Number.isFinite(Number(sub.metadata?.orion_user_id))
        ? store.getUserById(Number(sub.metadata.orion_user_id))
        : null);
    if (!user) return "invoice.paid user not found";
    const ent = entitlementFromStripeSubscription(sub, env);
    if (ent?.until) store.setUserPremium(user.id, ent);
    return `invoice.paid user=${user.id}`;
  }

  return null;
}

export function verifyWebhookSignature(rawBody, signatureHeader, env = process.env) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("webhook not configured");
  const stripe = getStripe(env);
  if (!stripe) throw new Error("stripe not configured");
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}
