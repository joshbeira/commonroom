import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* No account data sent to third parties. */
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <h1>A small interruption.</h1>
        <p>Your ledger is safe. Reload to reconnect with your household.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload Commonroom
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
