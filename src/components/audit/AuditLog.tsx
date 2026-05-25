import React, { useRef, useEffect } from "react";
import type { AuditEvent, AuditSeverity } from "../../core/types";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);
  const isAutoScrollRef = useRef(true);

  // Auto-scroll only if user is near bottom.
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

  return (
    <div
      className="audit-log"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {events.length === 0 ? (
        <div className="empty-state">
          <span>◎</span>
          No audit events yet
        </div>
      ) : (
        <>
          {events.map((event, idx) => (
            <AuditEventRow
              key={event.id}
              event={event}
              isNew={idx === 0}
            />
          ))}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
};

export default AuditLog;
