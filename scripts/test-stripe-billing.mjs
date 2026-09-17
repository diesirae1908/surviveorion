/**
 * Stripe Gold Patrol entitlement mapping (no live Stripe API).
 * Run: node scripts/test-stripe-billing.mjs
 */
process.env.ORION_DB = ":memory:";
process.env.STRIPE_PRICE_MONTHLY = "price_1UGo6k1jh5w1xlYdeY5EBvjf";
process.env.STRIPE_PRICE_YEARLY = "price_1UGo6k1jh5w1xlYdRbIIRlzL";

const { createUser, setUserPremium, getUserByStripeCustomerId } = await import("../server/db.mjs");
const { userTier, PREMIUM_PRODUCTS } = await import("../server/tier.mjs");
const {
  entitlementFromStripeSubscription,
  productIdForStripePrice,
  billingPublicConfig,
  applyStripeWebhookEvent,
} = await import("../server/stripe.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const cfg = billingPublicConfig();
check("billing display monthly USD", cfg.monthly.displayAmount === "$1.99");
check("billing display yearly USD", cfg.yearly.displayAmount === "$14.99");

check(
  "monthly price maps to product id",
  productIdForStripePrice(process.env.STRIPE_PRICE_MONTHLY) === "stripe.gold_patrol.monthly",
);
check(
  "yearly price maps to product id",
  productIdForStripePrice(process.env.STRIPE_PRICE_YEARLY) === "stripe.gold_patrol.yearly",
);

check("PREMIUM_PRODUCTS includes stripe monthly", PREMIUM_PRODUCTS.has("stripe.gold_patrol.monthly"));

const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;

const activeSub = {
  id: "sub_test_active",
  status: "active",
  current_period_end: periodEnd,
  items: { data: [{ price: { id: process.env.STRIPE_PRICE_MONTHLY } }] },
};
const activeEnt = entitlementFromStripeSubscription(activeSub);
check(
  "active subscription grants premium until period end",
  activeEnt?.source === "stripe" &&
    activeEnt.productId === "stripe.gold_patrol.monthly" &&
    activeEnt.until === periodEnd * 1000,
);

const canceledStillValid = {
  id: "sub_test_cancel",
  status: "canceled",
  current_period_end: periodEnd,
  items: { data: [{ price: { id: process.env.STRIPE_PRICE_YEARLY } }] },
};
const cancelEnt = entitlementFromStripeSubscription(canceledStillValid);
check(
  "canceled but inside paid period keeps until",
  cancelEnt?.until === periodEnd * 1000 && cancelEnt.productId === "stripe.gold_patrol.yearly",
);

const expired = {
  id: "sub_test_expired",
  status: "canceled",
  current_period_end: Math.floor(Date.now() / 1000) - 60,
  items: { data: [{ price: { id: process.env.STRIPE_PRICE_MONTHLY } }] },
};
const expiredEnt = entitlementFromStripeSubscription(expired);
check(
  "expired subscription clears entitlement",
  expiredEnt?.until === 0 && expiredEnt.productId === null,
);

const user = createUser({ callsign: "StripePilot" });
const store = await import("../server/db.mjs");
await applyStripeWebhookEvent(
  {
    type: "customer.subscription.updated",
    data: { object: { ...activeSub, customer: "cus_test_123" } },
  },
  { store, stripe: null },
);
check("webhook without customer match is no-op", userTier(user).tier === "free");

store.setStripeCustomerId(user.id, "cus_test_123");
await applyStripeWebhookEvent(
  {
    type: "customer.subscription.updated",
    data: { object: { ...activeSub, customer: "cus_test_123" } },
  },
  { store, stripe: null },
);
const linked = store.getUserById(user.id);
check("subscription.updated sets premium", userTier(linked).premiumActive === true);
check("stripe customer id lookup", getUserByStripeCustomerId("cus_test_123")?.id === user.id);

await applyStripeWebhookEvent(
  {
    type: "customer.subscription.deleted",
    data: { object: { ...expired, customer: "cus_test_123" } },
  },
  { store, stripe: null },
);
check(
  "subscription.deleted clears premium",
  userTier(store.getUserById(user.id)).premiumActive === false,
);

setUserPremium(user.id, {
  until: Date.now() + 86400_000,
  productId: "stripe.gold_patrol.monthly",
  transactionId: "sub_manual",
  source: "stripe",
});
check("setUserPremium stores stripe source", store.getUserById(user.id).premium_source === "stripe");

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("PASS  stripe billing entitlement mapping");
