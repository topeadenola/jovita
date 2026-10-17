import { Tabs } from "expo-router/js-tabs";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { useData } from "../../lib/data";
import { invState } from "../../lib/format";
import { C, F, isDark } from "../../lib/theme";
import { Redirect } from "expo-router";
import { tx } from "../../lib/i18n";

function TabIcon({ name, focused }) {
  return (
    <View style={{ width: 48, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: focused ? (isDark ? C.marigold : C.lilac) : "transparent" }}>
      <Icon name={name} size={22} color={focused ? "#261433" : C.ink} stroke={focused ? 2.3 : 1.8} />
    </View>
  );
}

export default function TabsLayout() {
  const { invoices, messages, studio } = useData();
  const unread = messages.filter((m) => m.from_client && !m.read).length;
  if (studio && studio.onboarded === false) return <Redirect href="/onboarding" />;
  const overdue = invoices.filter((i) => invState(i).k === "Overdue").length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: F.semi, fontSize: 11 },
        tabBarStyle: { backgroundColor: C.tabBar, borderTopColor: C.line },
        sceneStyle: { backgroundColor: C.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: tx("Today"), tabBarIcon: ({ focused }) => <TabIcon name="today" focused={focused} /> }} />
      <Tabs.Screen name="inbox" options={{ title: tx("Inbox"), tabBarBadge: unread || undefined, tabBarBadgeStyle: { backgroundColor: C.marigold, color: "#261433" }, tabBarIcon: ({ focused }) => <TabIcon name="inbox" focused={focused} /> }} />
      <Tabs.Screen name="projects" options={{ title: tx("Projects"), tabBarIcon: ({ focused }) => <TabIcon name="folder" focused={focused} /> }} />
      <Tabs.Screen name="money" options={{ title: tx("Money"), tabBarBadge: overdue || undefined, tabBarBadgeStyle: { backgroundColor: C.danger }, tabBarIcon: ({ focused }) => <TabIcon name="wallet" focused={focused} /> }} />
      <Tabs.Screen name="more" options={{ title: tx("More"), tabBarIcon: ({ focused }) => <TabIcon name="more" focused={focused} /> }} />
    </Tabs>
  );
}
