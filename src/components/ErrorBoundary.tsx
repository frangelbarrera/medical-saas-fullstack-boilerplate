import React, { Component, ErrorInfo, ReactNode } from "react";
import { text1, text2, glass, danger } from "../theme";
import { GCard } from "./GCard";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorInfo: any | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    try {
      const parsed = JSON.parse(error.message);
      return { hasError: true, errorInfo: parsed };
    } catch {
      return { hasError: true, errorInfo: { error: error.message } };
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const info = this.state.errorInfo;
      return (
        <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(20px)" }}>
          <GCard style={{ maxWidth: 500, padding: 32, textAlign: "center", border: `1px solid ${danger}44` }}>
            <h2 style={{ color: danger, fontSize: 24, marginBottom: 16 }}>System Error</h2>
            <p style={{ color: text1, marginBottom: 24 }}>
              Sorry, an unexpected error occurred in the communication with the database.
            </p>
            {info && (
              <div style={{ textAlign: "left", background: glass.input, padding: 16, borderRadius: 12, border: `1px solid ${glass.border}` }}>
                <p style={{ fontSize: 12, color: text2, fontFamily: "var(--font-sans)" }}>
                  <strong>Operation:</strong> {info.operationType || "N/A"}<br />
                  <strong>Path:</strong> {info.path || "N/A"}<br />
                  <strong>Error:</strong> {info.error}
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 32, padding: "12px 24px", borderRadius: 8, background: text1, color: "#000", fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              Reload Application
            </button>
          </GCard>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
