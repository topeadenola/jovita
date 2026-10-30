import PostalMime from "postal-mime";

// Cloudflare calls this for every email routed to this Worker.
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const mail = await PostalMime.parse(raw);
    // Newsletters and shop emails (AliExpress, Jumia…) carry list headers; real clients don't
    const h = (k) => (message.headers.get(k) || "").toLowerCase();
    // Check the parsed message too: forwarded mail (e.g. from Gmail) can carry these inside it
    const ph = (k) => ((mail.headers || []).find((x) => x.key === k)?.value || "").toLowerCase();
    const any = (k) => h(k) || ph(k);
    const bulk = !!(any("list-unsubscribe") || any("list-id") || /bulk|list|junk/.test(any("precedence")) || /^auto-(generated|replied)/.test(any("auto-submitted"))
      || any("x-campaign") || any("x-mailgun-tag") || any("x-sg-eid") || any("feedback-id") || any("x-mc-user"));
    const body = {
      bulk,
      to: message.to,
      from: (mail.from && mail.from.address) || message.from,
      from_name: (mail.from && mail.from.name) || "",
      subject: mail.subject || "",
      text: mail.text || "",
      html: mail.html || "",
      message_id: mail.messageId || "",
      in_reply_to: mail.inReplyTo || "",
    };
    const r = await fetch(env.INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-jovita-secret": env.INBOUND_SECRET || "" },
      body: JSON.stringify(body),
    });
    // If Jovita can't take it (unknown address), bounce so the sender knows
    if (r.status === 404) message.setReject("This address isn't in use.");
    else if (!r.ok) throw new Error("Jovita couldn't store this email (" + r.status + ")");
  },
};
