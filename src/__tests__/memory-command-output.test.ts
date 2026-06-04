import { describe, it, expect } from "vitest";
import { formatMemoryNotesList } from "../components/command/CommandInput";

describe("formatMemoryNotesList", () => {
  it("returns the empty-state message when there are no notes", () => {
    const result = formatMemoryNotesList([]);
    expect(result).toContain("No memory notes saved");
    expect(result).toContain("remember that");
    expect(result).toContain("Settings");
  });

  it("formats a single note as a numbered list", () => {
    const result = formatMemoryNotesList([{ content: "I prefer TypeScript" }]);
    expect(result).toContain("Memory notes (1)");
    expect(result).toContain("1. I prefer TypeScript");
  });

  it("formats multiple notes with correct numbering", () => {
    const notes = [
      { content: "I prefer TypeScript" },
      { content: "My main project is Lisa" },
      { content: "I work in the morning" },
    ];
    const result = formatMemoryNotesList(notes);
    expect(result).toContain("Memory notes (3)");
    expect(result).toContain("1. I prefer TypeScript");
    expect(result).toContain("2. My main project is Lisa");
    expect(result).toContain("3. I work in the morning");
  });

  it("preserves note content exactly as stored", () => {
    const notes = [{ content: "Reminder: meeting at 3pm" }];
    const result = formatMemoryNotesList(notes);
    expect(result).toContain("Reminder: meeting at 3pm");
  });

  it("produces one line per note in the numbered list", () => {
    const notes = [{ content: "alpha" }, { content: "beta" }];
    const lines = formatMemoryNotesList(notes).split("\n");
    expect(lines[0]).toContain("Memory notes (2)");
    expect(lines[1]).toBe("1. alpha");
    expect(lines[2]).toBe("2. beta");
  });

  it("empty state message is a guidance string, not a note dump", () => {
    const result = formatMemoryNotesList([]);
    expect(result.length).toBeLessThan(250);
  });

  // ── Phase 2J — boundary footer ──────────────────────────────────────────────

  it("non-empty list includes channel separation footer", () => {
    const result = formatMemoryNotesList([{ content: "TypeScript preferred" }]);
    expect(result).toContain("Conversation history and recent tool result context are stored separately");
  });

  it("empty state includes channel separation note", () => {
    const result = formatMemoryNotesList([]);
    expect(result).toContain("Conversation history and tool result context are stored separately");
  });

  it("footer appears after the note list, not before", () => {
    const notes = [{ content: "alpha" }];
    const result = formatMemoryNotesList(notes);
    const notePos = result.indexOf("1. alpha");
    const footerPos = result.indexOf("Conversation history");
    expect(footerPos).toBeGreaterThan(notePos);
  });
});
