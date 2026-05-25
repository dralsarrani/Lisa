import React from "react";
import type { Mission, MissionStatus, MissionStep, MissionStepStatus } from "../../core/types";
import "./MissionPanel.css";

interface MissionPanelProps {
  missions: Mission[];
}

const STATUS_LABEL: Record<MissionStatus, string> = {
  idle: "IDLE",
  planned: "PLANNED",
  running: "RUNNING",
  waiting_approval: "AWAITING",
  paused: "PAUSED",
  completed: "DONE",
  failed: "FAILED",
  cancelled: "CANCELLED",
  emergency_stopped: "STOPPED",
};

const STEP_ICON: Record<MissionStepStatus, string> = {
  pending: "○",
  running: "◉",
  completed: "●",
  failed: "✕",
  skipped: "—",
};

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function MissionStepRow({ step }: { step: MissionStep }) {
  return (
    <div className={`mission-step mission-step-${step.status}`}>
      <span className="mission-step-icon">{STEP_ICON[step.status]}</span>
      <div className="mission-step-content">
        <span className="mission-step-label">{step.label}</span>
        {step.notes && <span className="mission-step-notes">{step.notes}</span>}
      </div>
      {step.completedAt && (
        <span className="timestamp">{formatTime(step.completedAt)}</span>
      )}
    </div>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  const activeStepCount = mission.steps.filter(
    (s) => s.status === "completed"
  ).length;
  const progress =
    mission.steps.length > 0
      ? Math.round((activeStepCount / mission.steps.length) * 100)
      : 0;

  return (
    <div className={`mission-card mission-card-${mission.status}`}>
      <div className="mission-card-header">
        <div className="mission-card-title-row">
          <span className="mission-card-title">{mission.title}</span>
          <span className={`mission-status-badge mission-status-${mission.status}`}>
            {STATUS_LABEL[mission.status]}
          </span>
        </div>
        <p className="mission-card-desc">{mission.description}</p>
      </div>

      {mission.steps.length > 0 && (
        <>
          <div className="mission-progress-bar">
            <div
              className="mission-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mission-timeline">
            {mission.steps.map((step) => (
              <MissionStepRow key={step.id} step={step} />
            ))}
          </div>
        </>
      )}

      <div className="mission-card-footer">
        <span className="timestamp">Created {formatTime(mission.createdAt)}</span>
        {mission.completedAt && (
          <span className="timestamp">Finished {formatTime(mission.completedAt)}</span>
        )}
      </div>
    </div>
  );
}

export const MissionPanel: React.FC<MissionPanelProps> = ({ missions }) => {
  const active = missions.filter(
    (m) =>
      m.status === "running" ||
      m.status === "waiting_approval" ||
      m.status === "planned"
  );
  const history = missions.filter(
    (m) =>
      m.status === "completed" ||
      m.status === "failed" ||
      m.status === "cancelled" ||
      m.status === "emergency_stopped" ||
      m.status === "paused"
  );

  return (
    <div className="mission-panel">
      {missions.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">◎</span>
          No active missions
          <span style={{ fontSize: "0.55rem", marginTop: 4 }}>
            Type "Lisa, create test mission" to begin
          </span>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mission-section">
              <div className="mission-section-label">Active</div>
              {active.map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="mission-section">
              <div className="mission-section-label">History</div>
              {history.map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MissionPanel;
