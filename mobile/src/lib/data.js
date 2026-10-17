import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const AuthCtx = createContext({ session: undefined });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return createElement(AuthCtx.Provider, { value: { session } }, children);
}

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

const TABLES = ["clients", "projects", "invoices", "session_types", "bookings", "galleries", "messages", "templates", "expenses", "subscriptions", "calendar_connections", "calendar_busy"];
const EMPTY = Object.fromEntries(TABLES.map((t) => [t, []]));

export function DataProvider({ children }) {
  const { session } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, studio: null, ...EMPTY });
  const [refreshing, setRefreshing] = useState(false);

  const syncing = useRef(false);
  const load = useCallback(async () => {
    if (!session) { setState({ loading: false, error: null, studio: null, ...EMPTY }); return; }
    const { data: studio, error } = await supabase.from("studios").select("*").maybeSingle();
    if (error || !studio) {
      setState((s) => ({ ...s, loading: false, error: error ? error.message : "We couldn't find your studio." }));
      return;
    }
    const results = await Promise.all(TABLES.map((t) => supabase.from(t).select("*").order("created_at", { ascending: false })));
    const next = { loading: false, error: null, studio };
    TABLES.forEach((t, i) => { next[t] = results[i].data || []; });
    setState(next);
    // Pull fresh Google Calendar changes at most every 5 minutes
    const conn = next.calendar_connections?.[0];
    if (conn && (!conn.last_synced_at || Date.now() - new Date(conn.last_synced_at) > 5 * 6e4) && !syncing.current) {
      syncing.current = true;
      supabase.functions.invoke("google-calendar", { body: { action: "sync" } })
        .then(({ data: r, error: e }) => { if (!e && r && (r.pushed || r.pulled)) load(); })
        .finally(() => { syncing.current = false; });
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };
  // When bookings change, push them to Google Calendar if it's connected
  const pushCal = async (table) => {
    if (table !== "bookings" || !state.calendar_connections?.length) return;
    await supabase.functions.invoke("google-calendar", { body: { action: "sync" } }).catch(() => {});
    await load();
  };
  const insert = async (table, row) => {
    const { data, error } = await supabase.from(table).insert({ ...row, studio_id: state.studio.id }).select().single();
    if (error) throw error;
    await load();
    pushCal(table);
    return data;
  };
  const update = async (table, id, patch) => {
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) throw error;
    await load();
    pushCal(table);
  };
  const remove = async (table, id) => {
    const gid = table === "bookings" && (state.bookings || []).find((b) => b.id === id)?.google_event_id;
    if (gid) await supabase.functions.invoke("google-calendar", { body: { action: "delete_event", google_event_id: gid } }).catch(() => {});
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    await load();
  };
  const updateStudio = async (patch) => {
    const { error } = await supabase.from("studios").update(patch).eq("id", state.studio.id);
    if (error) throw error;
    await load();
  };
  const client = (id) => state.clients.find((c) => c.id === id) || { name: "Unknown client", city: "" };
  const project = (id) => state.projects.find((p) => p.id === id);

  return createElement(DataCtx.Provider, {
    value: { ...state, reload: load, refresh, refreshing, insert, update, remove, updateStudio, client, project, session },
  }, children);
}
