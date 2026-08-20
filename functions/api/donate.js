// POST /api/donate - create a PaymentIntent for a custom checkout.
//
// Deliberately the smallest possible Stripe footprint. A bare PaymentIntent
// creates a Customer only if you ask for one, so this asks for nothing: no
// customer, no product, no price, no invoice, no subscription. The Stripe
// dashboard gets one payment row and nothing else, which is the whole reason
// this exists instead of a hosted checkout link.
//
// Card details never touch this worker. The client collects them with Stripe
// Elements and confirms directly against Stripe, so the only thing crossing
// here is an amount.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });

export const onRequestOptions = () => json({ ok: true });

const CURRENCY = "nzd";
const MIN = 200;      // $2, below this the card fee eats the donation
const MAX = 100000;   // $1000, a ceiling so a typo cannot charge a fortune

export const onRequestGet = () =>
  json({
    endpoint: "POST /api/donate",
    body: { amount: "minor units, integer", currency: CURRENCY },
    min: MIN, max: MAX,
    creates: "a PaymentIntent only. No customer, product, price or invoice object."
  });

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: "payments not configured" }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const amount = Math.round(Number(b?.amount));
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX)
    return json({ error: `amount must be an integer between ${MIN} and ${MAX} minor units` }, 422);

  // Form encoded, because that is what the Stripe API takes.
  const form = new URLSearchParams({
    amount: String(amount),
    currency: CURRENCY,
    description: "aisubsidy donation",
    "automatic_payment_methods[enabled]": "true",
    // Wallets would redirect away from the custom page for no benefit here.
    "automatic_payment_methods[allow_redirects]": "never",
    "metadata[project]": "aisubsidy"
  });

  let intent;
  try {
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
        // Retrying a dropped request must not double charge.
        "idempotency-key": crypto.randomUUID()
      },
      body: form
    });
    intent = await res.json();
    if (intent.error) return json({ error: intent.error.message }, 502);
  } catch (e) {
    return json({ error: "stripe unreachable", detail: String(e) }, 502);
  }

  // Recorded so the site can show a running total. Amount and status only:
  // no name, no email, no card data. Stripe holds all of that; this holds none.
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO donations (id, amount, currency, status, created_at)
         VALUES (?,?,?,?,?)`
      ).bind(intent.id, amount, CURRENCY, intent.status, new Date().toISOString()).run();
    } catch { /* a payment must never fail because bookkeeping did */ }
  }

  return json({ client_secret: intent.client_secret, amount, currency: CURRENCY });
}
