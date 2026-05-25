import type { LisaMode, LisaModeId } from "./types";

export const LISA_MODES: Record<LisaModeId, LisaMode> = {
  normal: {
    id: "normal",
    name: "Normal Mode",
    description: "Everyday balanced operation. Full capabilities available.",
    orbTheme: "blue",
    behaviorSummary: "Balanced voice, normal memory, standard approval gates.",
  },
  focus: {
    id: "focus",
    name: "Focus Mode",
    description: "Deep work protection. Minimal interruptions, short responses.",
    orbTheme: "cyan",
    behaviorSummary: "Reduced interruptions, short answers, communication filtered.",
  },
  study: {
    id: "study",
    name: "Study Mode",
    description: "Academic work and learning. Notes, quizzes, lecture capture.",
    orbTheme: "indigo",
    behaviorSummary: "Study helpers active, deadline extraction, course folders.",
  },
  work: {
    id: "work",
    name: "Work Mode",
    description: "Professional productivity. Email, calendar, documents, tasks.",
    orbTheme: "blue",
    behaviorSummary: "Work apps prioritized, professional tone, task tracking.",
  },
  meeting: {
    id: "meeting",
    name: "Meeting Mode",
    description: "Live meeting or class support. Quiet, action-item capture.",
    orbTheme: "purple",
    behaviorSummary: "Silent alerts, transcription if enabled, action extraction.",
  },
  privacy: {
    id: "privacy",
    name: "Privacy Mode",
    description: "Reduced memory and screen observation. Minimal indexing.",
    orbTheme: "gray",
    behaviorSummary: "Memory capture reduced, screen indexing careful, private context controls.",
  },
  lockdown: {
    id: "lockdown",
    name: "Lockdown Mode",
    description: "Maximum restriction. Vault locked, communication blocked.",
    orbTheme: "red",
    behaviorSummary: "No autonomous desktop control, vault locked, communication blocked.",
  },
  sleep: {
    id: "sleep",
    name: "Sleep Mode",
    description: "Quiet background availability. Silent until called.",
    orbTheme: "dim",
    behaviorSummary: "Lisa stays resident but silent. Wake on command only.",
  },
  presentation: {
    id: "presentation",
    name: "Presentation Mode",
    description: "Screen sharing protection. Private notifications hidden.",
    orbTheme: "subtle",
    behaviorSummary: "Orb minimized, private overlays hidden, silent alerts.",
  },
  cyber: {
    id: "cyber",
    name: "Cyber Mode",
    description: "Authorized cybersecurity work. Scope guard active.",
    orbTheme: "green",
    behaviorSummary: "Scope guard enforced, evidence capture, command logs, rate limits.",
  },
  design: {
    id: "design",
    name: "Design Mode",
    description: "Creative and design workflows. Figma, assets, brand memory.",
    orbTheme: "pink",
    behaviorSummary: "Creative tools prioritized, brand memory active, visual snapshots.",
  },
  gaming: {
    id: "gaming",
    name: "Gaming Mode",
    description: "Gaming and launcher workflows. Performance throttled.",
    orbTheme: "orange",
    behaviorSummary: "Background missions throttled, low interruptions, launcher support.",
  },
  coding: {
    id: "coding",
    name: "Coding Mode",
    description: "Software engineering. Repos, IDE, terminal, tests, Git.",
    orbTheme: "teal",
    behaviorSummary: "Coding tools prioritized, Git policy active, engineering reports.",
  },
  tutor: {
    id: "tutor",
    name: "Tutor Mode",
    description: "Teaching and study planning. Adaptive explanations, quizzes.",
    orbTheme: "yellow",
    behaviorSummary: "Learning materials active, quizzes, progress tracking, spaced repetition.",
  },
  companion: {
    id: "companion",
    name: "Companion Mode",
    description: "Emotional support and casual interaction. Warm and supportive.",
    orbTheme: "violet",
    behaviorSummary: "Warm tone, supportive responses, personal routines, no manipulation.",
  },
};

export function getModeById(id: LisaModeId): LisaMode {
  return LISA_MODES[id];
}

export function getModeDisplayName(id: LisaModeId): string {
  return LISA_MODES[id]?.name ?? id;
}
