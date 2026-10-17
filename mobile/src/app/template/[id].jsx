import { useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { CURRENCIES, SYM, money } from "../../lib/format";
import { FIELDS, fill, values } from "../../lib/merge";
import Icon from "../../components/Icon";
import { Button, Card, Chips, Field, Screen, ToggleRow, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

export default function TemplateEditor() {
  const { id } = useLocalSearchParams();
  const { templates, loading } = useData();
  const t = templates.find((x) => x.id === id);
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  if (!t) return <Screen><Txt>{tx("This template was deleted.")}</Txt></Screen>;
  return <Editor key={t.id} t={t} />;
}

function Editor({ t }) {
  const { templates, studio, update, remove } = useData();
  const toast = useToast();
  const [f, setF] = useState(() => ({ name: t.name, subject: t.subject || "", body: t.body || "", items: t.items || [], currency: t.currency, is_default: t.is_default }));
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const total = f.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
  const insertField = (k) => {
    const token = `{${k}}`;
    const start = sel.start ?? f.body.length, end = sel.end ?? start;
    setF({ ...f, body: f.body.slice(0, start) + token + f.body.slice(end) });
    setSel({ start: start + token.length, end: start + token.length });
  };
  const setItem = (ix, k, v) => setF({ ...f, items: f.items.map((it, j) => (j === ix ? { ...it, [k]: k === "name" ? v : Number(v) || 0 } : it)) });
  const save = async () => {
    try {
      if (f.is_default && !t.is_default) await Promise.all(templates.filter((x) => x.kind === t.kind && x.is_default && x.id !== t.id).map((x) => update("templates", x.id, { is_default: false })));
      await update("templates", t.id, { ...f, subject: t.kind === "email" ? f.subject : null, updated_at: new Date().toISOString() });
      toast(tx("Template saved"));
    } catch (e) { toast(e.message); }
  };

  return (
    <Screen refresh={false}>
      <Stack.Screen options={{ title: f.name || tx("Template"), headerRight: () => <Button small title={tx("Save")} onPress={save} /> }} />
      <Chips scroll={false} options={[["edit", "Edit"], ["preview", "Preview"]]} value={preview ? "preview" : "edit"} onChange={(v) => setPreview(v === "preview")} />
      {preview ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 2, borderBottomColor: C.marigold, paddingBottom: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.plumCard, alignItems: "center", justifyContent: "center" }}><Txt style={{ color: C.marigold, fontFamily: F.display }}>{(studio?.name || "S").slice(0, 2).toUpperCase()}</Txt></View>
            <Txt style={{ fontFamily: F.bold }}>{studio?.name}</Txt>
          </View>
          {t.kind === "email" && <Txt style={{ fontFamily: F.bold }}>{fill(f.subject, values({ studio }))}</Txt>}
          {t.kind === "invoice" ? (
            <>
              {f.items.filter((it) => it.qty > 0).map((it, ix) => <View key={ix} style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}><Txt style={{ flex: 1 }}>{it.name}{it.qty > 1 ? ` × ${it.qty}` : ""}</Txt><Txt>{money(it.qty * it.price, f.currency)}</Txt></View>)}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Txt style={{ fontFamily: F.bold }}>{tx("Total")}</Txt><Txt style={{ fontFamily: F.bold }}>{money(total, f.currency)}</Txt></View>
              <Txt style={{ color: C.muted }}>{f.body}</Txt>
            </>
          ) : <Txt style={{ lineHeight: 22 }}>{fill(f.body, values({ studio }))}</Txt>}
        </Card>
      ) : (
        <>
          <Field label={tx("Template name")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          {t.kind === "email" && <Field label={tx("Subject line")} value={f.subject} onChangeText={(v) => setF({ ...f, subject: v })} />}
          {t.kind === "invoice" && (
            <Card>
              <Txt variant="h3">{tx("Line items")}</Txt>
              {f.items.map((it, ix) => (
                <View key={ix} style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10 }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Field style={{ flex: 1 }} value={it.name} onChangeText={(v) => setItem(ix, "name", v)} placeholder={tx("Item")} />
                    <Pressable accessibilityLabel={tx("Remove item")} onPress={() => setF({ ...f, items: f.items.filter((_, j) => j !== ix) })} style={{ padding: 8 }}><Icon name="x" size={18} color={C.muted} /></Pressable>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Field style={{ width: 80 }} value={String(it.qty)} onChangeText={(v) => setItem(ix, "qty", v)} keyboardType="number-pad" placeholder={tx("Qty")} />
                    <Field style={{ flex: 1 }} value={String(it.price)} onChangeText={(v) => setItem(ix, "price", v)} keyboardType="decimal-pad" placeholder={tx("Price ({v0})", {
                      v0: SYM[f.currency]
                    })} />
                  </View>
                </View>
              ))}
              <Button small variant="ghost" icon="plus" title={tx("Add line")} onPress={() => setF({ ...f, items: [...f.items, { name: "", qty: 1, price: 0 }] })} style={{ alignSelf: "flex-start" }} />
              <Txt style={{ fontFamily: F.bold }}>{tx("Total")}{" "}{money(total, f.currency)}</Txt>
              <Chips scroll={false} options={CURRENCIES.map((c) => [c, `${c} ${SYM[c]}`])} value={f.currency} onChange={(v) => setF({ ...f, currency: v })} />
            </Card>
          )}
          {t.kind !== "invoice" && (
            <>
              <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Tap to insert a merge field")}</Txt>
              <Chips options={FIELDS.filter(([k]) => t.kind === "email" || !k.startsWith("invoice")).map(([k, l]) => [k, `+ ${l}`])} value={null} onChange={insertField} />
            </>
          )}
          <Field label={t.kind === "invoice" ? tx("Notes and payment terms") : tx("Wording")} value={f.body} onChangeText={(v) => setF({ ...f, body: v })}
            multiline inputStyle={{ height: t.kind === "invoice" ? 110 : 320 }} onSelectionChange={(e) => setSel(e.nativeEvent.selection)} />
          <ToggleRow title={tx("Use by default")} sub={tx("New projects and invoices start with this one")} value={f.is_default} onChange={(v) => setF({ ...f, is_default: v })} />
        </>
      )}
      <Button title={tx("Save changes")} onPress={save} />
      {confirm ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Txt style={{ flex: 1 }}>{tx("Delete this template?")}</Txt>
          <Button small variant="ghost" title={tx("Keep")} onPress={() => setConfirm(false)} />
          <Button small variant="danger" title={tx("Delete")} onPress={async () => { await remove("templates", t.id); toast(tx("Template deleted")); router.back(); }} />
        </View>
      ) : <Button variant="ghost" title={tx("Delete template")} onPress={() => setConfirm(true)} style={{ alignSelf: "flex-start" }} />}
    </Screen>
  );
}
