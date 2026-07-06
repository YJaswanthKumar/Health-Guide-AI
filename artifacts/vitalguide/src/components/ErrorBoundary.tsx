import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("VitalGuide crashed:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-500">
              VitalGuide hit an unexpected error. Reloading usually fixes it.
            </p>
            {this.state.error?.message && (
              <p className="mt-3 rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-400 break-words">
                {this.state.error.message}
              </p>
            )}
            <Button onClick={this.handleReload} className="mt-5 gap-2 bg-teal-600 hover:bg-teal-700">
              <RefreshCw className="h-4 w-4" />
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
