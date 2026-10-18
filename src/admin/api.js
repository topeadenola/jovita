import { supabase } from "../supabase";
import { sampleAiUsage, sampleNotifications, sampleOverview, sampleStudios } from "./sample";

// Every call takes `sample`: true shows preview data and never touches the database.
const must = ({ data, error }) => { if (error) throw error; return data; };

export const api = {
  async isAdmin() { const { data, error } = await supabase.rpc("is_admin"); if (error) throw error; return !!data; },
  // Ask Jovita usage. Counts only: HQ never sees what anyone asked.
  async aiUsage(days, sample) { return sample ? sampleAiUsage(days) : must(await supabase.rpc("admin_ai_usage", { p_days: days })); },
  async overview(days, sample) { return sample ? sampleOverview(days) : must(await supabase.rpc("admin_overview", { p_days: days })); },
  async studios({ search = "", plan = "", limit = 50, offset = 0 }, sample) {
    if (sample) {
      const q = search.toLowerCase();
      const all = sampleStudios().filter((s) => (!plan || s.plan === plan) && (!q || s.name.toLowerCase().includes(q) || s.email.includes(q)));
      return { total: all.length, rows: all.slice(offset, offset + limit) };
    }
    return must(await supabase.rpc("admin_studios", { p_search: search, p_plan: plan, p_limit: limit, p_offset: offset }));
  },
  async allStudios(sample) { if (sample) return sampleStudios(); return (must(await supabase.rpc("admin_studios", { p_search: "", p_plan: "", p_limit: 100000, p_offset: 0 }))).rows; },
  async studioEvents(id, sample) {
    if (sample) return [{ kind: "upgrade", at: new Date(Date.now() - 3 * 864e5).toISOString(), meta: { from: "free", to: "pro" } }, { kind: "invoice_paid", at: new Date(Date.now() - 6 * 864e5).toISOString(), meta: { amount: 450000, currency: "NGN" } }, { kind: "gallery_published", at: new Date(Date.now() - 9 * 864e5).toISOString(), meta: {} }, { kind: "onboarded", at: new Date(Date.now() - 40 * 864e5).toISOString(), meta: {} }, { kind: "signup", at: new Date(Date.now() - 40 * 864e5).toISOString(), meta: {} }];
    return must(await supabase.rpc("admin_studio_events", { p_studio: id }));
  },
  async gifts(sample) { return sample ? [] : must(await supabase.rpc("admin_gifts")); },
  async giftPlan(emails, plan, until, note) { return must(await supabase.rpc("admin_gift_plan", { p_emails: emails, p_plan: plan, p_until: until, p_note: note })); },
  async cancelGift(id) { must(await supabase.rpc("admin_cancel_gift", { p_gift: id })); },
  async expireGifts() { try { await supabase.rpc("admin_expire_gifts"); } catch { /* before update 10 */ } },
  async updateStudio(id, patch, sample) { if (sample) return; must(await supabase.rpc("admin_update_studio", { p_studio: id, p_patch: patch })); },
  async notifications(sample) { return sample ? sampleNotifications() : must(await supabase.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(60)); },
  async markRead(ids, sample) { if (sample || !ids.length) return; must(await supabase.from("admin_notifications").update({ read: true }).in("id", ids)); },
  async milestones(sample) {
    if (sample) return [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000].map((g) => ({ metric: "studios", goal: g, reached_at: g <= 1000 ? new Date(Date.now() - (1000 / g) * 864e5 * 4).toISOString() : null, celebrated: g < 1000 }))
      .concat([10, 50, 100, 250, 500, 1000].map((g) => ({ metric: "paying", goal: g, reached_at: g <= 250 ? new Date(Date.now() - (250 / g) * 864e5 * 6).toISOString() : null, celebrated: true })));
    return must(await supabase.from("milestones").select("*").order("goal"));
  },
  async celebrated(m, sample) { if (sample) return; must(await supabase.from("milestones").update({ celebrated: true }).eq("metric", m.metric).eq("goal", m.goal)); },
  async prices() { const { data } = await supabase.from("plan_prices").select("*"); return data || []; },
  async offers(sample) { if (sample) return []; const { data, error } = await supabase.from("plan_offers").select("*").order("created_at", { ascending: false }); if (error) throw error; return data || []; },
  async addOffer(row) { return must(await supabase.from("plan_offers").insert(row).select().single()); },
  async updateOffer(id, patch) { must(await supabase.from("plan_offers").update(patch).eq("id", id)); },
  async savePrice(row) { must(await supabase.from("plan_prices").upsert(row)); },
  async billing(sample) { if (sample) return []; return must(await supabase.from("billing_payments").select("*, studios(name)").order("paid_at", { ascending: false }).limit(200)); },
  async events(kind, sample) {
    if (sample) return sampleOverview(30).recent.concat(sampleOverview(90).recent).map((e) => ({ ...e, created_at: e.at, studios: { name: e.studio } }));
    let q = supabase.from("events").select("*, studios(name)").order("created_at", { ascending: false }).limit(300);
    if (kind) q = q.eq("kind", kind);
    return must(await q);
  },
  async announcements() { return must(await supabase.from("announcements").select("*").order("created_at", { ascending: false })); },
  async saveAnnouncement(row) { return must(row.id ? await supabase.from("announcements").update(row).eq("id", row.id).select().single() : await supabase.from("announcements").insert(row).select().single()); },
  async deleteAnnouncement(id) { must(await supabase.from("announcements").delete().eq("id", id)); },
  async admins() { return must(await supabase.from("admins").select("*")); },
  async audit() { return must(await supabase.from("admin_audit").select("*").order("created_at", { ascending: false }).limit(100)); },
  listen(onNote) {
    const ch = supabase.channel("hq-notes").on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (p) => onNote(p.new)).subscribe();
    return () => supabase.removeChannel(ch);
  },
};
