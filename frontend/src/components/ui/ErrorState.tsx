import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  details?: string;
  onRetry?: () => void | Promise<void>;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this information from the box office. Please check your connection and try again.",
  details,
  onRetry,
  action,
  className = "",
}: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card elevated={false} className={`error-state ${className}`.trim()} role="alert">
      <div className="error-state-icon" aria-hidden="true">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--bad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-message">{message}</p>

      <div className="error-state-actions">
        {onRetry && (
          <Button
            variant="solid"
            size="md"
            loading={retrying}
            onClick={handleRetry}
          >
            Try again
          </Button>
        )}
        {action}
        {details && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setShowDetails((open) => !open)}
          >
            {showDetails ? "Hide technical details" : "Technical details"}
          </Button>
        )}
      </div>

      {details && showDetails && (
        <pre className="error-state-details">{details}</pre>
      )}
    </Card>
  );
}
