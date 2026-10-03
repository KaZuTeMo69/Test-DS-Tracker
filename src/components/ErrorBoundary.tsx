import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { versionLine } from "../lib/version";

/**
 * A part of the app whose file couldn't be fetched (Chrome, Firefox and Safari word it differently). Usually a page
 * left open while a newer version was published: the old version's files are gone, and only a reload gets the new
 * ones. A failed part stays failed until then, as React keeps the failed load.
 */
export const isLoadError = (error: unknown) =>
  /dynamically imported module|Importing a module script failed/i.test(
    error instanceof Error ? error.message : String(error),
  );

interface ErrorBoundaryProps {
  children: ReactNode;
  /** What it holds, for the message ("This panel"); without it, it's the whole app and fills the screen. */
  part?: string;
  /** When this changes (another tab, another store), the part is shown again. */
  resetKey?: unknown;
  /** Where the message sits, for a part placed over the map */
  className?: string;
}

interface ErrorBoundaryState {
  error: unknown;
  resetKey: unknown;
}

/** Shows a message with Reload in place of a part that failed, so one failure doesn't leave the whole page blank. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error ?? new Error("Unknown error") };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { part, className = "" } = this.props;
    const stale = isLoadError(error);
    const message = stale
      ? "A newer version of the app has been published since this page was opened. Reload to use it."
      : "Something went wrong here. Reload the page to try again.";
    const detail = error instanceof Error ? error.message : String(error);
    return (
      <div className={`app-error ${part ? "app-error-part" : "app-error-full"} ${className}`} role="alert">
        <div className="app-error-box">
          <AlertTriangle size={20} className="app-error-icon" aria-hidden="true" />
          <div className="app-error-title">
            {stale ? "Update available" : part ? `${part} couldn't be shown` : "Something went wrong"}
          </div>
          <p className="app-error-text">{message}</p>
          <button className="btn-primary app-error-reload" onClick={() => window.location.reload()}>
            <RefreshCw size={15} />
            <span>Reload</span>
          </button>
          {!stale && <p className="app-error-detail">{detail}</p>}
          <p className="app-error-detail">{versionLine()}</p>
        </div>
      </div>
    );
  }
}
