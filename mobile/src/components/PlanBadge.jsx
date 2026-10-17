import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useData } from "../lib/data";
import { daysLeft, usePlan } from "../lib/plan";
import { Txt } from "./ui";
import Icon from "./Icon";
import { C, F } from "../lib/theme";
import { tx, txn } from "../lib/i18n";

const NAME = { free: "Free", pro: "Pro", studio: "Studio" };

// Top-left of Today: "Free plan · Try Pro free", "Pro trial · 12 days left", or the paid plan's name
export default function PlanBadge() {
  const { studio } = useData();
  const [plan] = usePlan(studio);
  const trial = plan.status === "trialing";
  if (plan.plan !== "free" && !trial) {
    return <Pressable onPress={() => router.push("/plan")} accessibilityRole="button" accessibilityLabel={tx("Manage your plan")} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4, paddingVertical: 4 }}><Icon name="star" size={14} color={C.marigoldText || C.ink} /><Txt style={{ fontSize: 12, fontFamily: F.bold }}>{tx("{plan} plan", { plan: tx(NAME[plan.plan]) })}</Txt></Pressable>;
  }
  const label = trial ? txn(daysLeft(plan.trial_ends_at), "{n} day left", "{n} days left") : plan.trial_used ? tx("Upgrade") : tx("Try Pro free");
  return (
    <Pressable onPress={() => router.push("/plan")} accessibilityRole="button" accessibilityLabel={`${trial ? tx("Pro trial") : tx("Free plan")}, ${label}`}
      style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: trial ? C.marigold : C.lilac }}>
      <Txt style={{ fontSize: 12, fontFamily: F.semi, color: trial ? "#261433" : C.muted }}>{trial ? tx("Pro trial") : tx("Free plan")} ·</Txt>
      <Icon name="star" size={14} color={trial ? "#261433" : C.ink} />
      <Txt style={{ fontSize: 12, fontFamily: F.bold, color: trial ? "#261433" : C.ink }}>{label}</Txt>
    </Pressable>
  );
}
