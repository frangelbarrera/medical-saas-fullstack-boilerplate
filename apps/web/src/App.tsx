/**
 * Application root: providers (i18n, auth, toasts) + router + shell.
 */
import type { ReactElement } from "react";
import { AuthProvider, useSession } from "./auth/index.js";
import { I18nProvider } from "./i18n/index.js";
import { ToastHost } from "@medical/ui";
import { AppShell } from "./shell/AppShell.js";
import { Router } from "./routes.js";
import { LoginView } from "./views/LoginView.js";
import { DaybookView } from "./views/DaybookView.js";
import { AgendaView } from "./views/AgendaView.js";
import { PatientsView } from "./views/PatientsView.js";
import { RecordView } from "./views/RecordView.js";
import { MessagesView } from "./views/MessagesView.js";
import { BillingView } from "./views/BillingView.js";
import { InsightsView } from "./views/InsightsView.js";
import { AuditView } from "./views/AuditView.js";
import { AdminView } from "./views/AdminView.js";
import { SettingsView } from "./views/SettingsView.js";
import { EmptyState, Button } from "@medical/ui";
import { useI18n } from "./i18n/index.js";
import { navigate } from "./routes.js";

const View = ({ navId, params }: { navId: string; params: Record<string, string> }): ReactElement => {
  switch (navId) {
    case "daybook":
      return <DaybookView />;
    case "agenda":
      return <AgendaView />;
    case "patients":
      return params.id ? <RecordView patientId={params.id} /> : <PatientsView />;
    case "messages":
      return <MessagesView />;
    case "billing":
      return <BillingView />;
    case "insights":
      return <InsightsView />;
    case "audit":
      return <AuditView />;
    case "admin":
      return <AdminView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DaybookView />;
  }
};

const Missing = () => {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t("common.error")}
      body={t("patients.noResultsBody")}
      action={<Button onClick={() => navigate("/")}>{t("nav.daybook")}</Button>}
    />
  );
};

const Routed = () => {
  const { profile, loading } = useSession();

  if (loading) return null;
  if (!profile) return <LoginView />;

  return (
    <Router>
      {(match) =>
        match ? (
          <AppShell activeNav={match.route.navId}>
            <View navId={match.route.navId} params={match.params} />
          </AppShell>
        ) : (
          <AppShell activeNav="daybook">
            <Missing />
          </AppShell>
        )
      }
    </Router>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <ToastHost>
        <AuthProvider>
          <Routed />
        </AuthProvider>
      </ToastHost>
    </I18nProvider>
  );
}
