import { useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import { useData } from "../lib/data";
import { SYM, fdate, money, todayISO } from "../lib/format";
import { PERIODS, lastMonths, monthly, nextRenewalAfter, renewsIn, summary, toCSV, usedCurrencies } from "../lib/accounting";
import { Button, Card, Chips, Dot, Pill, Row, Screen, Txt, useToast } from "../components/ui";
import { C, F } from "../lib/theme";
import { tx, txn } from "../lib/i18n";

const INCOME = "#E89A00", SPENT = "#7A4FD6";

function Stat({ label, value, note, tone }) {
  const hero = tone === "hero";
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: hero ? C.marigold : C.white, borderRadius: 20, borderWidth: 1, borderColor: hero ? C.marigold : C.line, padding: 14, gap: 4 }}>
      <Txt style={{ fontSize: 12, fontFamily: F.semi, color: hero ? "#4A3000" : tone || C.muted }}>{label}</Txt>
      <Txt style={[{ fontFamily: F.displayBold, fontSize: 22, lineHeight: 26 }, String(value).length > 12 ? { fontSize: 17, lineHeight: 22 } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      {note ? <Txt style={{ fontSize: 12, color: hero ? "#4A3000" : C.muted }}>{note}</Txt> : null}
    </View>
  );
}

function Bars({ data, cur }) {
  const [pick, setPick] = useState(data.length - 1);
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spent]));
  const d = data[pick];
  return (
    <Card>
      <Txt variant="h2">{tx("Last 6 months")}</Txt>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: INCOME }} /><Txt style={{ fontSize: 13, color: C.muted, fontFamily: F.semi }}>{tx("Earned")}</Txt></View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: SPENT }} /><Txt style={{ fontSize: 13, color: C.muted, fontFamily: F.semi }}>{tx("Spent")}</Txt></View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 150, borderBottomWidth: 1, borderColor: C.lineStrong }}>
        {data.map((m, i) => (
          <Pressable key={m.label} onPress={() => setPick(i)} accessibilityLabel={tx("{label}: earned {money}, spent {money2}", {
            label: m.label,
            money: money(m.income, cur),
            money2: money(m.spent, cur)
          })}
            style={{ flex: 1, height: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3, backgroundColor: pick === i ? C.sunken : "transparent", borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
            <View style={{ width: 12, height: `${(m.income / max) * 92}%`, backgroundColor: INCOME, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            <View style={{ width: 12, height: `${(m.spent / max) * 92}%`, backgroundColor: SPENT, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>{data.map((m, i) => <Txt key={m.label} style={{ flex: 1, textAlign: "center", fontSize: 12, color: pick === i ? C.ink : C.muted, fontFamily: pick === i ? F.bold : F.body }}>{m.label}</Txt>)}</View>
      <View style={{ backgroundColor: C.sunken, borderRadius: 14, padding: 12, gap: 2 }}>
        <Txt style={{ fontFamily: F.bold }}>{d.label}</Txt>
        <Txt>{tx("Earned {income} · Spent {spent}", { income: money(d.income, cur), spent: money(d.spent, cur) })}</Txt>
        <Txt style={{ fontFamily: F.semi }}>{tx("Profit")}{" "}{money(d.income - d.spent, cur)}</Txt>
      </View>
    </Card>
  );
}

export default function Accounting() {
  const data = useData();
  const { studio, expenses, subscriptions, client, insert, update, remove, loading } = data;
  const toast = useToast();
  const [period, setPeriod] = useState("month");
  // Default to the studio's currency once it has loaded
  const [pick, setCur] = useState(null);
  const cur = pick || studio?.home_currency || "NGN";
  const s = useMemo(() => (studio ? summary(data, period, cur) : null), [data, period, cur, studio]);
  const months = useMemo(() => (studio ? lastMonths(data, cur) : []), [data, cur, studio]);
  if (loading || !studio) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  const curs = usedCurrencies(data, studio.home_currency);
  const subs = subscriptions.filter((x) => x.active).sort((a, b) => (a.next_renewal < b.next_renewal ? -1 : 1));
  const label = tx(PERIODS.find((p) => p[0] === period)[1]).toLowerCase();
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c[1]));
  const exp = [...s.expenseRows].sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));

  const paid = async (x) => {
    try {
      await insert("expenses", { vendor: x.name, category: "Software and subscriptions", amount: x.amount, currency: x.currency, spent_on: x.next_renewal > todayISO() ? todayISO() : x.next_renewal, note: x.cycle === "yearly" ? tx("Yearly subscription") : tx("Monthly subscription"), subscription_id: x.id });
      await update("subscriptions", x.id, { next_renewal: nextRenewalAfter(x) });
      toast(tx("{name} payment logged", {
        name: x.name
      }));
    } catch (e) { toast(e.message); }
  };

  return (
    <Screen>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {curs.length > 1 && <Chips scroll={false} options={curs.map((c) => [c, `${SYM[c]} ${c}`])} value={cur} onChange={setCur} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat tone="hero" label={tx("Earned {label}", {
          label: label
        })} value={money(s.income, cur)} note={txn(s.incomeRows.length, "{n} paid invoice", "{n} paid invoices")} />
        <Stat label={tx("Spent")} value={money(s.spent, cur)} note={txn(s.expenseRows.length, "{n} expense", "{n} expenses")} />
        <Stat tone={s.profit < 0 ? C.danger : C.success} label={s.profit < 0 ? tx("▼ Loss") : tx("▲ Profit")} value={money(Math.abs(s.profit), cur)} note={s.margin === null ? tx("No income yet") : tx("You keep {n}%", { n: s.margin })} />
        <Stat label={tx("Subscriptions")} value={tx("{amount}/mo", { amount: money(Math.round(s.subsMonthly), cur) })} note={tx("{n} active", { n: s.subsCount })} />
      </View>
      {s.owed > 0 && <Txt style={{ color: C.muted }}>{tx("Plus")}{" "}<Txt style={{ fontFamily: F.bold }}>{money(s.owed, cur)}</Txt>{" "}{tx("still owed on sent invoices.")}</Txt>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button style={{ flex: 1 }} title={tx("Add expense")} icon="plus" onPress={() => router.push({ pathname: "/new/expense", params: { cur } })} />
        <Button variant="secondary" title={tx("Export")} icon="share" onPress={() => Share.share({ title: tx("Jovita accounts"), message: toCSV(s, (id) => client(id).name) })} />
      </View>
      <Bars data={months} cur={cur} />
      <Card>
        <Txt variant="h2">{tx("Where the money went")}</Txt>
        {s.byCategory.map(([c, v]) => (
          <View key={c} style={{ gap: 6, paddingVertical: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Txt style={{ flex: 1 }}>{tx(c)}</Txt><Txt style={{ fontFamily: F.bold }}>{money(v, cur)}</Txt></View>
            <View style={{ height: 8, backgroundColor: C.sunken, borderRadius: 99, overflow: "hidden" }}><View style={{ width: `${(v / maxCat) * 100}%`, height: "100%", backgroundColor: SPENT, borderRadius: 99 }} /></View>
          </View>
        ))}
        {!s.byCategory.length && <Txt style={{ color: C.muted }}>{tx("No spending")}{" "}{label}.</Txt>}
      </Card>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="h2">{tx("Subscriptions")}</Txt>
          <Button small variant="ghost" icon="plus" title={tx("Add")} onPress={() => router.push({ pathname: "/new/subscription", params: { cur } })} />
        </View>
        {subs.map((x, ix) => { const n = renewsIn(x); return (
          <Row key={x.id} last={ix === subs.length - 1} left={<Dot icon="clock" tone="joy" />}
            onPress={() => router.push({ pathname: "/new/subscription", params: { id: x.id } })}
            title={x.name} sub={x.cycle === "yearly" ? tx("{amount} a year · {monthly}/mo", { amount: money(x.amount, x.currency), monthly: money(Math.round(monthly(x)), x.currency) }) : tx("{amount} a month", { amount: money(x.amount, x.currency) })}
            right={<View style={{ alignItems: "flex-end", gap: 6 }}>
              <Pill c={n < 0 ? "p-danger" : n <= 7 ? "p-warning" : "p-neutral"}>{n < 0 ? tx("Overdue") : n === 0 ? tx("Today") : fdate(x.next_renewal)}</Pill>
              {n <= 7 && <Button small variant="ghost" title={tx("Paid")} onPress={() => paid(x)} />}
            </View>} />
        ); })}
        {!subs.length && <Txt style={{ color: C.muted }}>{tx(
          "Add Adobe, Evoto and the other tools you pay for to see what they cost you each month."
        )}</Txt>}
      </Card>
      <Card>
        <Txt variant="h2">{tx("Expenses")}{" "}{label}</Txt>
        {exp.map((e, ix) => (
          <Row key={e.id} last={ix === exp.length - 1} title={e.vendor} sub={`${fdate(e.spent_on)} · ${tx(e.category)}${e.note ? ` · ${e.note}` : ""}`}
            right={<View style={{ alignItems: "flex-end", gap: 4 }}><Txt style={{ fontFamily: F.bold }}>{money(e.amount, e.currency)}</Txt>
              <Pressable hitSlop={10} onPress={async () => { await remove("expenses", e.id); toast(tx("Expense deleted")); }}><Txt style={{ fontSize: 12, color: C.danger, fontFamily: F.semi }}>{tx("Delete")}</Txt></Pressable></View>} />
        ))}
        {!exp.length && <Txt style={{ color: C.muted }}>{expenses.length ? tx("Nothing in {cur} {label}.", {
          cur: cur,
          label: label
        }) : tx("Log gear, travel, rent and crew costs to see your real profit.")}</Txt>}
      </Card>
    </Screen>
  );
}
