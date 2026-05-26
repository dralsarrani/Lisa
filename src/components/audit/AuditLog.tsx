import React, { useRef, useEffect, useState } from "react";
import type { AuditEvent, AuditSeverity } from "../../core/types";
import { createAuditEvent } from "../../core/audit-store";
import { useLisa } from "../../app/useLisa";
import "./AuditLog.css";

interface AuditLogProps {
  events: AuditEvent[];
}

const SEVERITY_ICONS: Record<AuditSeverity, string> = {
  info: "·",
  warning: "▲",
  error: "✕",
  critical: "⚡",
};

type SeverityFilter = "all" | AuditSeverity;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AuditEventRow({ event, isNew }: { event: AuditEvent; isNew: boolean }) {
  return (
    <div className={`audit-row audit-severity-${event.severity} ${isNew ? "fade-in-up" : ""}`}>
      <span className="audit-icon">{SEVERITY_ICONS[event.severity]}</span>
      <span className="audit-time">{formatTime(event.timestamp)}</span>
      <span className="audit-source">{event.source}</span>
      <span className="audit-summary">{event.summary}</span>
      {event.details && (
        <span className="audit-details" title={event.details}>
          {event.details.length > 60 ? event.details.slice(0, 60) + "…" : event.details}
        </span>
      )}
    </div>
  );
}

export const AuditLog: React.FC<AuditLogProps> = ({ events }) => {
  const { state, dispatch } = useLisa();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);
  const isAutoScrollRef = useRef(true);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [clearPending, setClearPending] = useState(false);

  useEffect(() => {
    if (!isAutoScrollRef.current) return;
    if (events.length !== prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevLengthRef.current = events.length;
    }
  }, [events]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isAutoScrollRef.current = atBottom;
  }

  function handleClearConfirm() {
    const sentinelEvent = createAuditEvent({
      eventType: "audit_log_cleared",
      source: "audit_log_ui",
      summary: "Audit log cleared by user (dev/demo action). Previous entries are gone.",
      severity: "warning",
    });
    dispatch({ type: "CLEAR_AUDIT_LOG", payload: sentinelEvent });
    setClearPending(false);
    setFilter("all");
  }

  const isDev = state.settings.developerMode;
  const filtered = filter === "all" ? events : events.filter((e) => e.severity === filter);
  const FILTERS: SeverityFilter[] = ["all", "info", "warning", "error", "critical"];

  return (
    <div className="audit-log-wrapper">
      <div className="audit-toolbar">
        <div className="audit-filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`audit-filter-tab ${filter === f ? "audit-filter-active" : ""} ${f !== "all" ? `audit-filter-${f}` : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? `All (${events.length})` : f}
            </button>
          ))}
        </div>

        {isDev && (
          <div className="audit-clear-area">
            {clearPending ? (
              <>
                <span className="audit-clear-warning">Permanently delete all logs?</span>
                <button className="btn btn-danger audit-clear-btn" onClick={handleClearConfirm}>
                  Confirm Clear
                </button>
                <button className="btn audit-clear-btn" onClick={() => setClearPending(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn audit-clear-btn"
                onClick={() => setClearPending(true)}
                title="Dev/demo only — permanently clears all audit events after confirmation"
              >
                Clear Log
              </button>
            )}
          </div>
        )}
      </div>

      <div className="audit-log" ref={containerRef} onScroll={handleScroll}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span>◎</span>
            {events.length === 0 ? "No audit events yet" : `No ${filter} events`}
          </div>
        ) : (
          <>
            {filtered.map((event, idx) => (
              <AuditEventRow key={event.id} event={event} isNew={idx === 0} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
