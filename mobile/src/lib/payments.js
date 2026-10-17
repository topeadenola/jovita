// The payment accounts a studio can connect. Shared by Settings, the invoice editor and the client page.
// Public keys are safe in the browser; secret keys are saved write-only (see migration 20261014050000).
export const PROVIDERS = {
  paystack: {
    name: "Paystack", flag: "pay_paystack", blurb: "Cards, bank and USSD in Nigeria, Ghana, Kenya and South Africa",
    currencies: ["NGN", "GHS", "KES", "ZAR", "USD"],
    help: "Paystack dashboard › Settings › API Keys & Webhooks",
    fields: [
      { k: "public_key", label: "Public key", ph: "pk_live_…", re: /^pk_(live|test)_\w{10,}$/ },
      { k: "secret", label: "Secret key", ph: "sk_live_…", re: /^sk_(live|test)_\w{10,}$/, secret: true },
    ],
  },
  flutterwave: {
    name: "Flutterwave", flag: "pay_flutterwave", blurb: "Cards, bank and mobile money across Africa",
    currencies: ["NGN", "GHS", "KES", "ZAR", "XOF", "USD", "GBP", "EUR"],
    help: "Flutterwave dashboard › Settings › API Keys",
    fields: [
      { k: "public_key", label: "Public key", ph: "FLWPUBK-…", re: /^FLWPUBK(_TEST)?-\w{10,}/ },
      { k: "secret", label: "Secret key", ph: "FLWSECK-…", re: /^FLWSECK(_TEST)?-\w{10,}/, secret: true },
    ],
  },
  paypal: {
    name: "PayPal", flag: "pay_paypal", blurb: "PayPal balance and cards, worldwide",
    currencies: ["USD", "GBP", "EUR"],
    help: "developer.paypal.com › Apps & Credentials › your app",
    fields: [
      { k: "public_key", label: "Client ID", ph: "A…", re: /^[\w-]{40,}$/ },
      { k: "secret", label: "Secret", ph: "E…", re: /^[\w-]{40,}$/, secret: true },
    ],
  },
  stripe: {
    name: "Stripe", flag: "pay_stripe", blurb: "Cards and Apple Pay in the UK, US and Europe",
    currencies: ["GBP", "USD", "EUR"],
    help: "Stripe dashboard › Developers › API keys",
    fields: [
      { k: "public_key", label: "Publishable key", ph: "pk_live_…", re: /^pk_(live|test)_\w{10,}$/ },
      { k: "secret", label: "Secret key", ph: "sk_live_…", re: /^(sk|rk)_(live|test)_\w{10,}$/, secret: true },
    ],
  },
  bank: {
    name: "Bank transfer", flag: "pay_transfer", blurb: "Your local bank account. Clients transfer and you confirm when it lands",
    currencies: null,
    fields: [
      { k: "bank_name", label: "Bank", ph: "GTBank", detail: true, required: true },
      { k: "account_name", label: "Account name", ph: "SmithLine Photography", detail: true, required: true },
      { k: "account_number", label: "Account number or IBAN", ph: "0123456789", detail: true, required: true },
      { k: "sort_code", label: "Sort code, routing or SWIFT (optional)", ph: "", detail: true },
      { k: "currency", label: "Currency", detail: true, select: ["NGN", "GHS", "KES", "GBP", "USD", "EUR", "XOF"] },
    ],
  },
};
export const ORDER = ["paystack", "flutterwave", "paypal", "stripe", "bank"];
export const isTest = (key) => /_test_|_TEST|^sb-/i.test(key || "");
export const mask = (v) => (v ? v.slice(0, 8) + "…" + v.slice(-4) : "");
// Plain text for the bank block clients see
export const bankText = (d = {}) => [d.bank_name && `Bank: ${d.bank_name}`, d.account_name && `Account name: ${d.account_name}`, d.account_number && `Account number: ${d.account_number}`, d.sort_code && `Sort code / SWIFT: ${d.sort_code}`].filter(Boolean).join("\n");
