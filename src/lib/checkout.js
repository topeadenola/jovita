// Client-page checkout with the studio's OWN accounts (their public keys only).
// When the payment provider says it went through, we report it with the reference; the studio confirms it in Money.
const loaded = {};
function script(src) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the payment window. Check your connection.")); document.head.appendChild(s); });
  return loaded[src];
}
const ref = (inv) => `JV-${inv.number}-${Date.now().toString(36)}`;

export async function payPaystack({ key, inv, email, name }) {
  await script("https://js.paystack.co/v1/inline.js");
  return new Promise((resolve, reject) => {
    const h = window.PaystackPop.setup({
      key, email: email || "client@getjovita.com", amount: Math.round(Number(inv.amount) * 100), currency: inv.currency, ref: ref(inv),
      metadata: { invoice: inv.number, custom_fields: [{ display_name: "Client", variable_name: "client", value: name || "" }] },
      callback: (r) => resolve(r.reference), onClose: () => reject(new Error("closed")),
    });
    h.openIframe();
  });
}

export async function payFlutterwave({ key, inv, email, name, title }) {
  await script("https://checkout.flutterwave.com/v3.js");
  return new Promise((resolve, reject) => {
    let done = false;
    window.FlutterwaveCheckout({
      public_key: key, tx_ref: ref(inv), amount: Number(inv.amount), currency: inv.currency,
      payment_options: "card,mobilemoney,ussd,banktransfer", customer: { email: email || "client@getjovita.com", name: name || "" },
      customizations: { title: title || "Invoice", description: `Invoice #${inv.number}` },
      callback: (r) => { if (["successful", "completed"].includes(String(r.status).toLowerCase())) { done = true; resolve(r.transaction_id ? String(r.transaction_id) : r.tx_ref); } },
      onclose: () => { if (!done) reject(new Error("closed")); },
    });
  });
}

// PayPal renders its own buttons into a box on the page
export async function renderPayPal({ key, inv, el, onPaid, onError }) {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(key)}&currency=${inv.currency}&intent=capture`;
  await script(src);
  el.innerHTML = "";
  return window.paypal.Buttons({
    style: { layout: "vertical", shape: "pill", label: "pay" },
    createOrder: (_d, actions) => actions.order.create({ purchase_units: [{ description: `Invoice #${inv.number}`, amount: { value: Number(inv.amount).toFixed(2), currency_code: inv.currency } }] }),
    onApprove: async (_d, actions) => { const o = await actions.order.capture(); onPaid(o.id); },
    onError: (e) => onError(e?.message || "PayPal couldn't take the payment."),
  }).render(el);
}
