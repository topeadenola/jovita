// "Train your Jovita": how reminders and replies sound.
// warmth 0 formal · 1 balanced · 2 friendly — length 0 short · 1 normal · 2 detailed
import { tx } from "./i18n";

export const WARMTH = ["Formal", "Balanced", "Friendly"];
export const LENGTH = ["Short", "Normal", "Detailed"];

export function draftNudge({ name, amount, label, late = 0, link = "", warmth = 2, length = 1, signer = "" }) {
  const open = [tx("Dear {name},", { name }), tx("Hi {name},", { name }), tx("Hi {name}!", { name })][warmth];
  const when = late > 0 ? tx("is now {n} days past due", { n: late }) : tx("is due soon");
  const body = [
    tx("Your payment of {amount} {when}.", { amount, when }),
    tx("Just a reminder that your payment of {amount} for {label} {when}. You can pay whenever you're ready.", { amount, label, when }),
    tx("I hope you're well. A gentle reminder that your payment of {amount} for {label} {when}. You can pay by card or bank transfer from your link, and do shout if you have any questions.", { amount, label, when }),
  ][length];
  const pay = link ? "\n" + tx("Pay here: {link}", { link }) : "";
  const sign = [tx("Regards,"), tx("Thanks,"), tx("Thank you!")][warmth] + (signer ? " " + signer : "");
  return `${open} ${body}${pay}\n${sign}`;
}

export function draftReply({ name, warmth = 2, length = 1, signer = "" }) {
  const open = [tx("Dear {name},", { name }), tx("Hi {name},", { name }), tx("Hi {name}!", { name })][warmth];
  const body = [
    tx("Thanks for your message. I'll get back to you shortly."),
    tx("Thanks so much for reaching out. Let me check my diary and send you the details today."),
    tx("Thank you so much for reaching out, it's lovely to hear from you. Let me check my diary and send you my packages and availability today, and we can take it from there."),
  ][length];
  const sign = [tx("Regards,"), tx("Thanks,"), tx("Speak soon!")][warmth] + (signer ? " " + signer : "");
  return `${open} ${body}\n${sign}`;
}

// Links that open the message ready to send in the person's own WhatsApp or email
export const waLink = (phone, text) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : "";
};
export const mailLink = (email, subject, text) =>
  email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : "";
