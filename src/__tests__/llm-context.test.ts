import { describe, it, expect } from "vitest";
import {
  buildLisaSystemPrompt,
  buildOllamaMessages,
  trimConversationHistory,
} from "../core/llm-context";
import type { LisaConversationTurn } from "../core/llm-context";

// ─── buildLisaSystemPrompt ────────────────────────────────────────────────────

describe("buildLisaSystemPrompt — capability boundaries", () => {
  it("returns a non-empty string", () => {
    expect(buildLisaSystemPrompt().length).toBeGreaterThan(100);
  });

  it("declares Lisa cannot control the desktop", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("cannot control the desktop");
  });

  it("declares Lisa cannot access screen content", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("screen");
  });

  it("declares Lisa cannot browse files arbitrarily", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("filesystem");
  });

  it("declares Lisa cannot store or ask for passwords", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("passwords");
  });

  it("declares Lisa cannot make external network requests", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("external server");
  });

  it("declares Lisa cannot take autonomous background actions", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("autonomous");
  });

  it("instructs Lisa not to pretend to execute unavailable actions", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("do not pretend");
  });

  it("declares voice input is not yet implemented", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("voice");
  });

  it("declares Lisa cannot execute code or run programs autonomously", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("execute code");
  });

  it("declares Lisa does not have true long-term semantic memory", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("long-term semantic memory");
  });

  it("declares desktop control is not unlockable by approval", () => {
    expect(buildLisaSystemPrompt().toLowerCase()).toContain("approval cannot unlock");
  });
});

// ─── trimConversationHistory ──────────────────────────────────────────────────

function makeTurn(i: number): LisaConversationTurn {
  return {
    userInput: `question ${i}`,
    assistantResponse: `answer ${i}`,
    timestamp: new Date().toISOString(),
    model: "test-model",
  };
}

describe("trimConversationHistory", () => {
  it("returns history unchanged when within limit", () => {
    const history = [makeTurn(1), makeTurn(2), makeTurn(3)];
    expect(trimConversationHistory(history, 5)).toHaveLength(3);
  });

  it("trims to the most recent N turns when over limit", () => {
    const history = [makeTurn(1), makeTurn(2), makeTurn(3), makeTurn(4), makeTurn(5)];
    const result = trimConversationHistory(history, 3);
    expect(result).toHaveLength(3);
    expect(result[0].userInput).toBe("question 3");
    expect(result[2].userInput).toBe("question 5");
  });

  it("returns empty array when maxTurns is 0", () => {
    expect(trimConversationHistory([makeTurn(1), makeTurn(2)], 0)).toHaveLength(0);
  });

  it("returns empty array when history is empty", () => {
    expect(trimConversationHistory([], 10)).toHaveLength(0);
  });

  it("returns empty array when maxTurns is negative", () => {
    expect(trimConversationHistory([makeTurn(1)], -5)).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const history = [makeTurn(1), makeTurn(2), makeTurn(3)];
    trimConversationHistory(history, 1);
    expect(history).toHaveLength(3);
  });
});

// ─── buildOllamaMessages ──────────────────────────────────────────────────────

describe("buildOllamaMessages", () => {
  it("always starts with a system message", () => {
    const messages = buildOllamaMessages([], "hello");
    expect(messages[0].role).toBe("system");
  });

  it("ends with the user's current input", () => {
    const messages = buildOllamaMessages([], "what is rust?");
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("what is rust?");
  });

  it("produces only system + user when history is empty", () => {
    const messages = buildOllamaMessages([], "single question");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("interleaves history as alternating user/assistant pairs after system", () => {
    const history = [makeTurn(1), makeTurn(2)];
    const messages = buildOllamaMessages(history, "new question");
    // layout: [system, user1, assistant1, user2, assistant2, user_new]
    expect(messages).toHaveLength(6);
    expect(messages[1]).toMatchObject({ role: "user", content: "question 1" });
    expect(messages[2]).toMatchObject({ role: "assistant", content: "answer 1" });
    expect(messages[3]).toMatchObject({ role: "user", content: "question 2" });
    expect(messages[4]).toMatchObject({ role: "assistant", content: "answer 2" });
    expect(messages[5]).toMatchObject({ role: "user", content: "new question" });
  });

  it("system prompt content matches buildLisaSystemPrompt()", () => {
    const messages = buildOllamaMessages([], "test");
    expect(messages[0].content).toBe(buildLisaSystemPrompt());
  });
});
