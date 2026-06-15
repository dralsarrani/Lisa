import { describe, it, expect } from "vitest";
import { LISA_MODES, getModeById, getModeDisplayName } from "../core/mode-store";
import type { LisaModeId } from "../core/types";

describe("LISA_MODES", () => {
  it("contains all 15 expected modes", () => {
    expect(Object.keys(LISA_MODES)).toHaveLength(15);
  });

  it("includes all documented mode IDs", () => {
    const expectedModes: LisaModeId[] = [
      "normal",
      "focus",
      "study",
      "work",
      "meeting",
      "privacy",
      "lockdown",
      "sleep",
      "presentation",
      "cyber",
      "design",
      "gaming",
      "coding",
      "tutor",
      "companion",
    ];

    for (const modeId of expectedModes) {
      expect(LISA_MODES).toHaveProperty(modeId);
    }
  });

  it("each mode has all required properties", () => {
    for (const [, mode] of Object.entries(LISA_MODES)) {
      expect(mode).toHaveProperty("id");
      expect(mode).toHaveProperty("name");
      expect(mode).toHaveProperty("description");
      expect(mode).toHaveProperty("orbTheme");
      expect(mode).toHaveProperty("behaviorSummary");
    }
  });

  it("each mode ID matches its key", () => {
    for (const [key, mode] of Object.entries(LISA_MODES)) {
      expect(mode.id).toBe(key);
    }
  });

  it("each mode has a non-empty name", () => {
    for (const mode of Object.values(LISA_MODES)) {
      expect(mode.name).toBeTruthy();
      expect(mode.name.length).toBeGreaterThan(0);
    }
  });

  it("each mode has a non-empty description", () => {
    for (const mode of Object.values(LISA_MODES)) {
      expect(mode.description).toBeTruthy();
      expect(mode.description.length).toBeGreaterThan(0);
    }
  });

  it("each mode has a non-empty orbTheme", () => {
    for (const mode of Object.values(LISA_MODES)) {
      expect(mode.orbTheme).toBeTruthy();
      expect(mode.orbTheme.length).toBeGreaterThan(0);
    }
  });

  it("each mode has a non-empty behaviorSummary", () => {
    for (const mode of Object.values(LISA_MODES)) {
      expect(mode.behaviorSummary).toBeTruthy();
      expect(mode.behaviorSummary.length).toBeGreaterThan(0);
    }
  });

  describe("specific modes have expected themes", () => {
    it("normal mode has blue theme", () => {
      expect(LISA_MODES.normal.orbTheme).toBe("blue");
    });

    it("focus mode has cyan theme", () => {
      expect(LISA_MODES.focus.orbTheme).toBe("cyan");
    });

    it("lockdown mode has red theme", () => {
      expect(LISA_MODES.lockdown.orbTheme).toBe("red");
    });

    it("privacy mode has gray theme", () => {
      expect(LISA_MODES.privacy.orbTheme).toBe("gray");
    });

    it("sleep mode has dim theme", () => {
      expect(LISA_MODES.sleep.orbTheme).toBe("dim");
    });

    it("cyber mode has green theme", () => {
      expect(LISA_MODES.cyber.orbTheme).toBe("green");
    });

    it("coding mode has teal theme", () => {
      expect(LISA_MODES.coding.orbTheme).toBe("teal");
    });
  });
});

describe("getModeById", () => {
  it("returns the correct mode for a valid ID", () => {
    const mode = getModeById("normal");
    expect(mode).toBe(LISA_MODES.normal);
    expect(mode.name).toBe("Normal Mode");
  });

  it("returns the same object reference for the same ID", () => {
    const mode1 = getModeById("focus");
    const mode2 = getModeById("focus");
    expect(mode1).toBe(mode2);
  });

  it("works for all mode IDs", () => {
    const modeIds: LisaModeId[] = [
      "normal",
      "focus",
      "study",
      "work",
      "meeting",
      "privacy",
      "lockdown",
      "sleep",
      "presentation",
      "cyber",
      "design",
      "gaming",
      "coding",
      "tutor",
      "companion",
    ];

    for (const id of modeIds) {
      const mode = getModeById(id);
      expect(mode).toBeDefined();
      expect(mode.id).toBe(id);
    }
  });

  it("returns mode object with correct structure", () => {
    const mode = getModeById("study");
    expect(mode).toEqual({
      id: "study",
      name: "Study Mode",
      description: "Academic work and learning. Notes, quizzes, lecture capture.",
      orbTheme: "indigo",
      behaviorSummary:
        "Study helpers active, deadline extraction, course folders.",
    });
  });
});

describe("getModeDisplayName", () => {
  it("returns the display name for a valid mode ID", () => {
    expect(getModeDisplayName("normal")).toBe("Normal Mode");
  });

  it("returns the correct names for all modes", () => {
    expect(getModeDisplayName("normal")).toBe("Normal Mode");
    expect(getModeDisplayName("focus")).toBe("Focus Mode");
    expect(getModeDisplayName("study")).toBe("Study Mode");
    expect(getModeDisplayName("work")).toBe("Work Mode");
    expect(getModeDisplayName("meeting")).toBe("Meeting Mode");
    expect(getModeDisplayName("privacy")).toBe("Privacy Mode");
    expect(getModeDisplayName("lockdown")).toBe("Lockdown Mode");
    expect(getModeDisplayName("sleep")).toBe("Sleep Mode");
    expect(getModeDisplayName("presentation")).toBe("Presentation Mode");
    expect(getModeDisplayName("cyber")).toBe("Cyber Mode");
    expect(getModeDisplayName("design")).toBe("Design Mode");
    expect(getModeDisplayName("gaming")).toBe("Gaming Mode");
    expect(getModeDisplayName("coding")).toBe("Coding Mode");
    expect(getModeDisplayName("tutor")).toBe("Tutor Mode");
    expect(getModeDisplayName("companion")).toBe("Companion Mode");
  });

  it("returns the ID itself when mode does not exist (fallback)", () => {
    const invalidId = "nonexistent" as LisaModeId;
    expect(getModeDisplayName(invalidId)).toBe(invalidId);
  });

  it("returns the same name as the mode object's name property", () => {
    for (const [id] of Object.entries(LISA_MODES)) {
      const name = getModeDisplayName(id as LisaModeId);
      const modeObject = getModeById(id as LisaModeId);
      expect(name).toBe(modeObject.name);
    }
  });
});
