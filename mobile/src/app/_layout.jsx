import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, useFonts } from "@expo-google-fonts/figtree";
import { AuthProvider, DataProvider, useAuth, useData } from "../lib/data";
import { LangProvider, initLang, useLang } from "../lib/lang";
import { ToastProvider } from "../components/ui";
import { ThemeProvider } from "../components/Theme";
import PaidMoment from "../components/PaidMoment";
import { C, F } from "../lib/theme";
import { tx } from "../lib/i18n";

SplashScreen.preventAutoHideAsync();
initLang();

function Navigator() {
  const { session } = useAuth();
  const { studio } = useData() || {};
  const { lang, change } = useLang();
  // The studio's saved language wins over the phone's region, unless picked on this phone
  useEffect(() => { if (studio?.language && studio.language !== lang) change(studio.language, { persist: false, auto: true }); }, [studio?.language]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session !== undefined) SplashScreen.hideAsync(); }, [session]);
  if (session === undefined) return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.paper },
        headerShadowVisible: false,
        headerTintColor: C.ink,
        headerTitleStyle: { fontFamily: F.displayBold, fontSize: 18 },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: C.paper },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ title: tx("Project") }} />
        <Stack.Screen name="client/[id]" options={{ title: tx("Client") }} />
        <Stack.Screen name="thread/[cid]" options={{ title: tx("Messages") }} />
        <Stack.Screen name="template/[id]" options={{ title: tx("Edit template") }} />
        <Stack.Screen name="clients" options={{ title: tx("Clients") }} />
        <Stack.Screen name="ask" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="bookings" options={{ title: tx("Bookings") }} />
        <Stack.Screen name="galleries" options={{ title: tx("Galleries") }} />
        <Stack.Screen name="templates" options={{ title: tx("Templates") }} />
        <Stack.Screen name="settings" options={{ title: tx("Settings") }} />
        <Stack.Screen name="payments" options={{ title: tx("Payments") }} />
        <Stack.Screen name="plan" options={{ title: tx("Plan") }} />
        <Stack.Screen name="accounting" options={{ title: tx("Accounting") }} />
        <Stack.Screen name="new/client" options={{ presentation: "modal", title: tx("New client") }} />
        <Stack.Screen name="new/project" options={{ presentation: "modal", title: tx("New project") }} />
        <Stack.Screen name="new/invoice" options={{ presentation: "modal", title: tx("New invoice") }} />
        <Stack.Screen name="new/booking" options={{ presentation: "modal", title: tx("New booking") }} />
        <Stack.Screen name="new/expense" options={{ presentation: "modal", title: tx("Add expense") }} />
        <Stack.Screen name="new/subscription" options={{ presentation: "modal", title: tx("Subscription") }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold,
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <LangProvider>
            <ThemeProvider>
              <ToastProvider>
                <Navigator />
                <PaidMoment />
              </ToastProvider>
            </ThemeProvider>
          </LangProvider>
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
