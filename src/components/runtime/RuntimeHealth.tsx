import React from "react";
import type { RuntimeHealth as RuntimeHealthData, ServiceStatus } from "../../core/types";
import "./RuntimeHealth.css";

interface RuntimeHealthProps {
  health: RuntimeHealthData | null;
  onRefresh: () => void;
}

function ServiceRow({
  name,
  status,
  detail,
}: {
  name: string;
  status: ServiceStatus;
  detail?: string;
}) {
  const dotClass =
    status === "available"
      ? "status-dot-online"
      : status === "not_configured"
      ? "status-dot-offline"
      : status === "checking"
      ? "status-dot-checking"
      : "status-dot-error";

  return (
    <div className="runtime-service-row">
      <span className={`status-dot ${dotClass}`} />
      <span className="runtime-service-name">{name}</span>
      <span className="runtime-service-status">{detail ?? status.replace(/_/g, " ")}</span>
    </div>
  );
}

export const RuntimeHealth: React.FC<RuntimeHealthProps> = ({ health, onRefresh }) => {
  if (!health) {
    return (
      <div className="runtime-empty">
        <p className="runtime-hint">
          Type "Lisa, check local runtime" to query system health.
        </p>
        <button className="btn btn-primary" onClick={onRefresh}>
          Check Now
        </button>
      </div>
    );
  }

  const checkedAt = health.lastChecked
    ? new Date(health.lastChecked).toLocaleTimeString()
    : "—";

  return (
    <div className="runtime-health">
      <div className="runtime-grid">
        <div className="runtime-field">
          <span className="runtime-field-label">Backend</span>
          <span className={`runtime-field-value ${health.backendReachable ? "runtime-ok" : "runtime-offline"}`}>
            {health.backendReachable ? "ONLINE" : "OFFLINE (browser mode)"}
          </span>
        </div>
        <div className="runtime-field">
          <span className="runtime-field-label">Version</span>
          <span className="runtime-field-value">{health.appVersion}</span>
        </div>
        <div className="runtime-field">
          <span className="runtime-field-label">OS</span>
          <span className="runtime-field-value">{health.osType}</span>
        </div>
        <div className="runtime-field">
          <span className="runtime-field-label">Arch</span>
          <span className="runtime-field-value">{health.arch}</span>
        </div>
        {health.osVersion && (
          <div className="runtime-field runtime-field-wide">
            <span className="runtime-field-label">OS Version</span>
            <span className="runtime-field-value runtime-field-mono truncate" title={health.osVersion}>
              {health.osVersion.length > 60 ? health.osVersion.slice(0, 60) + "…" : health.osVersion}
            </span>
          </div>
        )}
      </div>

      <div className="runtime-services">
        <div className="runtime-services-label">External Services</div>
        <ServiceRow
          name="Ollama (local LLM)"
          status={health.ollamaStatus}
          detail={
            health.ollamaStatus === "available"
              ? "Running on :11434"
              : "Not configured — Phase 1"
          }
        />
        <ServiceRow
          name="Docker"
          status={health.dockerStatus}
          detail={
            health.dockerStatus === "available"
              ? "Daemon reachable"
              : "Not configured — Phase 1"
          }
        />
      </div>

      <div className="runtime-footer">
        <span className="timestamp">Last checked: {checkedAt}</span>
        <button className="btn runtime-refresh-btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  );
};

export default RuntimeHealth;
