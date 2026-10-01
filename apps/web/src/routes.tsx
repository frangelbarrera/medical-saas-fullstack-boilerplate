/**
 * Minimal history router (no extra dependency): declarative route table with
 * capability gating (ARCH-003). The server serves index.html for non-API
 * paths, so real URLs work on refresh.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Capability } from "@medical/contracts";
import { useSession } from "./auth/index.js";

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
}

export const useRoute = (): RouteMatch => {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return { path, params: {} };
};

export const navigate = (path: string): void => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  document.getElementById("main-content")?.focus?.();
};

export const matchPath = (pattern: string, path: string): Record<string, string> | null => {
  const p = pattern.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
};

export interface RouteDef {
  pattern: string;
  titleKey: string;
  capability?: Capability;
  navId: string;
}

/** Route table: single source of truth for navigation + gating. */
export const ROUTES: RouteDef[] = [
  { pattern: "/", titleKey: "nav.daybook", navId: "daybook" },
  { pattern: "/agenda", titleKey: "nav.agenda", capability: "schedule:read", navId: "agenda" },
  { pattern: "/patients", titleKey: "nav.patients", capability: "patients:read", navId: "patients" },
  { pattern: "/patients/:id/record", titleKey: "nav.patients", capability: "patients:read", navId: "patients" },
  { pattern: "/messages", titleKey: "nav.messages", capability: "messages:read", navId: "messages" },
  { pattern: "/billing", titleKey: "nav.billing", capability: "billing:read", navId: "billing" },
  { pattern: "/insights", titleKey: "nav.insights", capability: "insights:read", navId: "insights" },
  { pattern: "/audit", titleKey: "nav.audit", capability: "audit:read", navId: "audit" },
  { pattern: "/admin", titleKey: "nav.admin", capability: "admin:clinic", navId: "admin" },
  { pattern: "/settings", titleKey: "nav.settings", navId: "settings" },
];

export const Router = ({ children }: { children: (match: { route: RouteDef; params: Record<string, string> } | null) => ReactNode }) => {
  const { path } = useRoute();
  const { can, loading } = useSession();

  const resolve = useCallback(() => {
    for (const route of ROUTES) {
      const params = matchPath(route.pattern, path);
      if (params) {
        if (route.capability && !can(route.capability)) return null;
        return { route, params };
      }
    }
    return null;
  }, [path, can]);

  if (loading) return null;
  return <>{children(resolve())}</>;
};
