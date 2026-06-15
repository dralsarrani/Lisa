import { describe, it, expect } from "vitest";
import { routeCommand, getDesktopActionGuardMessage, getVoiceCapabilityMessage, getScreenCapabilityMessage, formatScreenContextResponse, findLastRepeatableResponse, formatOcrResponse } from "../core/command-router";

describe("routeCommand — emergency_stop", () => {
  it("routes 'emergency stop'", () => {
    expect(routeCommand("emergency stop").intent).toBe("emergency_stop");
  });
  it("routes 'emergency stop now'", () => {
    expect(routeCommand("emergency stop now").intent).toBe("emergency_stop");
  });
  it("routes 'abort'", () => {
    expect(routeCommand("abort").intent).toBe("emergency_stop");
  });
  it("routes 'stop everything'", () => {
    expect(routeCommand("stop everything").intent).toBe("emergency_stop");
  });
  it("routes 'Lisa, emergency stop'", () => {
    expect(routeCommand("Lisa, emergency stop").intent).toBe("emergency_stop");
  });
  it("has high confidence", () => {
    expect(routeCommand("emergency stop").confidence).toBe("high");
  });
});

describe("routeCommand — stop", () => {
  it("routes 'stop'", () => {
    expect(routeCommand("stop").intent).toBe("stop");
  });
  it("routes 'halt'", () => {
    expect(routeCommand("halt").intent).toBe("stop");
  });
  it("routes 'freeze'", () => {
    expect(routeCommand("freeze").intent).toBe("stop");
  });
});

describe("routeCommand — sleep", () => {
  it("routes 'sleep'", () => {
    expect(routeCommand("sleep").intent).toBe("sleep");
  });
  it("routes 'go to sleep'", () => {
    expect(routeCommand("go to sleep").intent).toBe("sleep");
  });
  it("routes 'quiet mode'", () => {
    expect(routeCommand("quiet mode").intent).toBe("sleep");
  });
  it("routes 'Lisa, sleep'", () => {
    expect(routeCommand("Lisa, sleep").intent).toBe("sleep");
  });
});

describe("routeCommand — wake", () => {
  it("routes 'wake up'", () => {
    expect(routeCommand("wake up").intent).toBe("wake");
  });
  it("routes 'wake'", () => {
    expect(routeCommand("wake").intent).toBe("wake");
  });
  it("routes 'resume'", () => {
    expect(routeCommand("resume").intent).toBe("wake");
  });
  it("routes 'hello lisa'", () => {
    expect(routeCommand("hello lisa").intent).toBe("wake");
  });
  it("routes 'Lisa, wake up'", () => {
    expect(routeCommand("Lisa, wake up").intent).toBe("wake");
  });
});

describe("routeCommand — runtime_health", () => {
  it("routes 'status'", () => {
    expect(routeCommand("status").intent).toBe("runtime_health");
  });
  it("routes 'check health'", () => {
    expect(routeCommand("check health").intent).toBe("runtime_health");
  });
  it("routes 'runtime status'", () => {
    expect(routeCommand("runtime status").intent).toBe("runtime_health");
  });
  it("routes 'system status'", () => {
    expect(routeCommand("system status").intent).toBe("runtime_health");
  });
  it("routes 'Lisa, status'", () => {
    expect(routeCommand("Lisa, status").intent).toBe("runtime_health");
  });
});

describe("routeCommand — create_test_mission", () => {
  it("routes 'create test mission'", () => {
    expect(routeCommand("create test mission").intent).toBe("create_test_mission");
  });
  it("routes 'test mission'", () => {
    expect(routeCommand("test mission").intent).toBe("create_test_mission");
  });
  it("routes 'Lisa, test mission'", () => {
    expect(routeCommand("Lisa, test mission").intent).toBe("create_test_mission");
  });
});

describe("routeCommand — approve_test_action", () => {
  it("routes 'approve'", () => {
    expect(routeCommand("approve").intent).toBe("approve_test_action");
  });
  it("routes 'confirm'", () => {
    expect(routeCommand("confirm").intent).toBe("approve_test_action");
  });
  it("routes 'approve test action'", () => {
    expect(routeCommand("approve test action").intent).toBe("approve_test_action");
  });
});

describe("routeCommand — reject_test_action", () => {
  it("routes 'reject'", () => {
    expect(routeCommand("reject").intent).toBe("reject_test_action");
  });
  it("routes 'deny'", () => {
    expect(routeCommand("deny").intent).toBe("reject_test_action");
  });
  it("routes 'cancel'", () => {
    expect(routeCommand("cancel").intent).toBe("reject_test_action");
  });
});

describe("routeCommand — mode_change", () => {
  it("routes 'activate focus mode'", () => {
    const r = routeCommand("activate focus mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
  it("routes 'switch to coding mode'", () => {
    const r = routeCommand("switch to coding mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("coding");
  });
  it("routes 'enable work mode'", () => {
    const r = routeCommand("enable work mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("work");
  });
  it("routes 'Lisa, activate normal mode'", () => {
    const r = routeCommand("Lisa, activate normal mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("normal");
  });
  it("routes bare mode name 'activate focus'", () => {
    const r = routeCommand("activate focus");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
});

describe("routeCommand — mode_change with article 'the'", () => {
  it("routes 'Activate the cyber mode'", () => {
    const r = routeCommand("Activate the cyber mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("cyber");
  });
  it("routes 'activate the cyber mode' (lowercase)", () => {
    const r = routeCommand("activate the cyber mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("cyber");
  });
  it("routes 'switch to the focus mode'", () => {
    const r = routeCommand("switch to the focus mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
  it("routes 'enable the work mode'", () => {
    const r = routeCommand("enable the work mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("work");
  });
});

describe("routeCommand — mode_change additional verbs", () => {
  it("routes 'turn on focus mode'", () => {
    const r = routeCommand("turn on focus mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
  it("routes 'go back to normal mode'", () => {
    const r = routeCommand("go back to normal mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("normal");
  });
  it("routes 'return to normal'", () => {
    const r = routeCommand("return to normal");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("normal");
  });
  it("routes 'go cyber mode'", () => {
    const r = routeCommand("go cyber mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("cyber");
  });
  it("routes 'use coding mode'", () => {
    const r = routeCommand("use coding mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("coding");
  });
});

describe("routeCommand — mode_change bare mode names", () => {
  it("routes bare 'cyber mode'", () => {
    const r = routeCommand("cyber mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("cyber");
  });
  it("routes bare 'normal mode'", () => {
    const r = routeCommand("normal mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("normal");
  });
  it("routes bare 'gaming'", () => {
    const r = routeCommand("gaming");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("gaming");
  });
  it("routes bare 'privacy mode'", () => {
    const r = routeCommand("privacy mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("privacy");
  });
});

describe("getDesktopActionGuardMessage — blocked commands", () => {
  it("blocks 'open Steam and download a game'", () => {
    expect(getDesktopActionGuardMessage("open Steam and download a game")).not.toBeNull();
  });
  it("blocks 'can you control my mouse'", () => {
    expect(getDesktopActionGuardMessage("can you control my mouse")).not.toBeNull();
  });
  it("does not block the Phase 4C OCR capability question", () => {
    expect(getDesktopActionGuardMessage("can you read my screen")).toBeNull();
  });
  it("blocks 'launch Chrome'", () => {
    expect(getDesktopActionGuardMessage("launch Chrome")).not.toBeNull();
  });
  it("blocks 'move the cursor to the top'", () => {
    expect(getDesktopActionGuardMessage("move the cursor to the top")).not.toBeNull();
  });
  it("blocks 'right-click the desktop'", () => {
    expect(getDesktopActionGuardMessage("right-click the desktop")).not.toBeNull();
  });
  it("does not block 'capture the screen' — Phase 4A explicit capture is allowed", () => {
    expect(getDesktopActionGuardMessage("capture the screen")).toBeNull();
  });
  it("returns a message containing 'not implemented'", () => {
    const msg = getDesktopActionGuardMessage("open Steam and download a game");
    expect(msg).toContain("not implemented");
  });
});

describe("getDesktopActionGuardMessage — safe commands pass through", () => {
  it("passes 'what is quantum entanglement'", () => {
    expect(getDesktopActionGuardMessage("what is quantum entanglement")).toBeNull();
  });
  it("passes 'explain recursion simply'", () => {
    expect(getDesktopActionGuardMessage("explain recursion simply")).toBeNull();
  });
  it("passes 'what can you help me with'", () => {
    expect(getDesktopActionGuardMessage("what can you help me with")).toBeNull();
  });
  it("passes empty string", () => {
    expect(getDesktopActionGuardMessage("")).toBeNull();
  });
  it("passes 'activate cyber mode'", () => {
    expect(getDesktopActionGuardMessage("activate cyber mode")).toBeNull();
  });
});

describe("routeCommand — unknown", () => {
  it("routes unrecognized command", () => {
    expect(routeCommand("do something weird").intent).toBe("unknown");
  });
  it("routes empty string", () => {
    expect(routeCommand("").intent).toBe("unknown");
  });
  it("has low confidence for unknown", () => {
    expect(routeCommand("something random").confidence).toBe("low");
  });
  it("unknown response includes the original input", () => {
    const r = routeCommand("foobar");
    expect(r.response).toContain("foobar");
  });
});

describe("routeCommand — Lisa prefix stripping", () => {
  it("strips 'LISA, ' prefix case-insensitively", () => {
    expect(routeCommand("LISA, WAKE UP").intent).toBe("wake");
  });
  it("strips 'Lisa ' prefix (no comma)", () => {
    expect(routeCommand("Lisa status").intent).toBe("runtime_health");
  });
  it("preserves raw and sets normalized without prefix", () => {
    const r = routeCommand("Lisa, wake up");
    expect(r.raw).toBe("Lisa, wake up");
    expect(r.normalized).toBe("wake up");
  });
});

describe("routeCommand — response field", () => {
  it("returns non-empty response for all known intents", () => {
    const commands = [
      "emergency stop",
      "stop",
      "sleep",
      "wake up",
      "status",
      "create test mission",
      "approve",
      "reject",
      "activate focus mode",
    ];
    for (const cmd of commands) {
      expect(routeCommand(cmd).response).toBeTruthy();
    }
  });
});

// ─── Memory commands — add_memory_note ───────────────────────────────────────

describe("routeCommand — add_memory_note", () => {
  it("routes 'remember that I prefer TypeScript over JavaScript'", () => {
    const r = routeCommand("remember that I prefer TypeScript over JavaScript");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("I prefer TypeScript over JavaScript");
  });

  it("routes 'remember I prefer TypeScript' (without 'that')", () => {
    const r = routeCommand("remember I prefer TypeScript");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("I prefer TypeScript");
  });

  it("routes 'note that my preferred editor is VS Code'", () => {
    const r = routeCommand("note that my preferred editor is VS Code");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("my preferred editor is VS Code");
  });

  it("routes 'save memory: I use Windows'", () => {
    const r = routeCommand("save memory: I use Windows");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("I use Windows");
  });

  it("routes 'add memory: I prefer concise answers'", () => {
    const r = routeCommand("add memory: I prefer concise answers");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("I prefer concise answers");
  });

  it("routes 'Lisa, remember that my main project is AUTO'", () => {
    const r = routeCommand("Lisa, remember that my main project is AUTO");
    expect(r.intent).toBe("add_memory_note");
    expect(r.payload?.noteContent).toBe("my main project is AUTO");
  });

  it("preserves original case of note content", () => {
    const r = routeCommand("remember that I use TypeScript and React");
    expect(r.payload?.noteContent).toBe("I use TypeScript and React");
  });

  it("has high confidence", () => {
    expect(routeCommand("remember that I prefer dark mode").confidence).toBe("high");
  });
});

// ─── Memory commands — list_memory_notes ─────────────────────────────────────

describe("routeCommand — list_memory_notes", () => {
  it("routes 'list memory notes'", () => {
    expect(routeCommand("list memory notes").intent).toBe("list_memory_notes");
  });

  it("routes 'show memory notes'", () => {
    expect(routeCommand("show memory notes").intent).toBe("list_memory_notes");
  });

  it("routes 'what do you remember'", () => {
    expect(routeCommand("what do you remember").intent).toBe("list_memory_notes");
  });

  it("routes 'what memory notes do you have'", () => {
    expect(routeCommand("what memory notes do you have").intent).toBe("list_memory_notes");
  });

  it("routes 'memory notes'", () => {
    expect(routeCommand("memory notes").intent).toBe("list_memory_notes");
  });

  it("routes 'Lisa, list memory notes'", () => {
    expect(routeCommand("Lisa, list memory notes").intent).toBe("list_memory_notes");
  });
});

// ─── Memory commands — delete_memory_note ────────────────────────────────────

describe("routeCommand — delete_memory_note", () => {
  it("routes 'delete memory 1' with noteIndex=1", () => {
    const r = routeCommand("delete memory 1");
    expect(r.intent).toBe("delete_memory_note");
    expect(r.payload?.noteIndex).toBe(1);
  });

  it("routes 'forget memory 1'", () => {
    const r = routeCommand("forget memory 1");
    expect(r.intent).toBe("delete_memory_note");
    expect(r.payload?.noteIndex).toBe(1);
  });

  it("routes 'remove memory 3' with noteIndex=3", () => {
    const r = routeCommand("remove memory 3");
    expect(r.intent).toBe("delete_memory_note");
    expect(r.payload?.noteIndex).toBe(3);
  });

  it("routes 'Lisa, delete memory 2' with noteIndex=2", () => {
    const r = routeCommand("Lisa, delete memory 2");
    expect(r.intent).toBe("delete_memory_note");
    expect(r.payload?.noteIndex).toBe(2);
  });
});

// ─── Memory commands — request_clear_memory_notes ────────────────────────────

describe("routeCommand — request_clear_memory_notes", () => {
  it("routes 'clear memory notes'", () => {
    expect(routeCommand("clear memory notes").intent).toBe("request_clear_memory_notes");
  });

  it("routes 'clear all memory notes'", () => {
    expect(routeCommand("clear all memory notes").intent).toBe("request_clear_memory_notes");
  });

  it("routes 'delete all memory notes'", () => {
    expect(routeCommand("delete all memory notes").intent).toBe("request_clear_memory_notes");
  });

  it("response instructs user to confirm", () => {
    expect(routeCommand("clear memory notes").response).toContain("confirm clear memory");
  });
});

// ─── Memory commands — confirm_clear_memory_notes ────────────────────────────

describe("routeCommand — confirm_clear_memory_notes", () => {
  it("routes 'confirm clear memory'", () => {
    expect(routeCommand("confirm clear memory").intent).toBe("confirm_clear_memory_notes");
  });

  it("routes 'Lisa, confirm clear memory'", () => {
    expect(routeCommand("Lisa, confirm clear memory").intent).toBe("confirm_clear_memory_notes");
  });

  it("bare 'confirm' still routes to approve_test_action", () => {
    expect(routeCommand("confirm").intent).toBe("approve_test_action");
  });

  it("has high confidence", () => {
    expect(routeCommand("confirm clear memory").confidence).toBe("high");
  });
});

// ─── Phase 1J audit — routing coverage gaps ───────────────────────────────────

describe("routeCommand — runtime_health exact phrases", () => {
  it("routes 'check local runtime'", () => {
    expect(routeCommand("check local runtime").intent).toBe("runtime_health");
  });
  it("routes 'Lisa, check local runtime'", () => {
    expect(routeCommand("Lisa, check local runtime").intent).toBe("runtime_health");
  });
});

describe("routeCommand — mode_change 'switch to cyber mode'", () => {
  it("routes 'switch to cyber mode'", () => {
    const r = routeCommand("switch to cyber mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("cyber");
  });
});

// ─── Phase 2B — action-like guard expansion ──────────────────────────────────
//
// Phase 2B promotes several action-request patterns from LLM-tier to guard-tier.
// These patterns are blocked deterministically with a safe refusal message.
// Conceptual/educational questions still pass through to the LLM.

describe("getDesktopActionGuardMessage — Phase 2B file/shell guards", () => {
  it("blocks 'run this file'", () => {
    expect(getDesktopActionGuardMessage("run this file")).not.toBeNull();
  });
  it("blocks 'execute this script'", () => {
    expect(getDesktopActionGuardMessage("execute this script")).not.toBeNull();
  });
  it("blocks 'run a shell command'", () => {
    expect(getDesktopActionGuardMessage("run a shell command")).not.toBeNull();
  });
  it("blocks 'execute a shell command'", () => {
    expect(getDesktopActionGuardMessage("execute a shell command")).not.toBeNull();
  });
  it("blocks 'Can you run this file?'", () => {
    expect(getDesktopActionGuardMessage("Can you run this file?")).not.toBeNull();
  });
});

describe("getDesktopActionGuardMessage — Phase 2B UI interaction guards", () => {
  it("blocks 'click this button'", () => {
    expect(getDesktopActionGuardMessage("click this button")).not.toBeNull();
  });
  it("blocks 'press this button'", () => {
    expect(getDesktopActionGuardMessage("press this button")).not.toBeNull();
  });
  it("blocks 'type this for me'", () => {
    expect(getDesktopActionGuardMessage("type this for me")).not.toBeNull();
  });
  it("blocks 'Can you click this button?'", () => {
    expect(getDesktopActionGuardMessage("Can you click this button?")).not.toBeNull();
  });
});

describe("getDesktopActionGuardMessage — Phase 2B network/permissions/install guards", () => {
  it("blocks 'connect to the restricted network'", () => {
    expect(getDesktopActionGuardMessage("connect to the restricted network")).not.toBeNull();
  });
  it("blocks 'verify permissions'", () => {
    expect(getDesktopActionGuardMessage("verify permissions")).not.toBeNull();
  });
  it("blocks 'request permissions'", () => {
    expect(getDesktopActionGuardMessage("request permissions")).not.toBeNull();
  });
  it("blocks 'approve permissions'", () => {
    expect(getDesktopActionGuardMessage("approve permissions")).not.toBeNull();
  });
  it("blocks 'install this tool'", () => {
    expect(getDesktopActionGuardMessage("install this tool")).not.toBeNull();
  });
  it("blocks 'install this skill'", () => {
    expect(getDesktopActionGuardMessage("install this skill")).not.toBeNull();
  });
  it("blocks 'Can you connect to a restricted network?'", () => {
    expect(getDesktopActionGuardMessage("Can you connect to a restricted network?")).not.toBeNull();
  });
  it("blocks 'Can you verify permissions?'", () => {
    expect(getDesktopActionGuardMessage("Can you verify permissions?")).not.toBeNull();
  });
});

describe("getDesktopActionGuardMessage — conceptual questions pass through", () => {
  it("passes 'what is a shell command?'", () => {
    expect(getDesktopActionGuardMessage("what is a shell command?")).toBeNull();
  });
  it("passes 'how do permissions work?'", () => {
    expect(getDesktopActionGuardMessage("how do permissions work?")).toBeNull();
  });
  it("passes 'explain browser automation'", () => {
    expect(getDesktopActionGuardMessage("explain browser automation")).toBeNull();
  });
  it("returns updated refusal message containing 'explicit approval'", () => {
    const msg = getDesktopActionGuardMessage("run this file");
    expect(msg).toContain("not implemented yet");
    expect(msg).toContain("explicit approval");
  });
});

// ─── Phase 3D voice capability guard ─────────────────────────────────────────

describe("getVoiceCapabilityMessage — voice input questions", () => {
  it("answers 'do you have voice input'", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Phase 3D");
  });

  it("answers 'can you use voice input'", () => {
    expect(getVoiceCapabilityMessage("can you use voice input")).not.toBeNull();
  });

  it("answers 'how do I enable voice input'", () => {
    expect(getVoiceCapabilityMessage("how do I enable voice input")).not.toBeNull();
  });

  it("answers 'I am trying to enable the voice input'", () => {
    expect(getVoiceCapabilityMessage("I am trying to enable the voice input")).not.toBeNull();
  });

  it("response mentions KeyV or button", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg).toMatch(/KeyV|button/i);
  });

  it("response states Whisper model is required", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("whisper");
  });

  it("response states no background listening", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("background");
  });

  it("response mentions KeyV as the trigger", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });
});

describe("getVoiceCapabilityMessage — background listening questions", () => {
  it("answers 'can you listen in the background'", () => {
    const msg = getVoiceCapabilityMessage("can you listen in the background");
    expect(msg).not.toBeNull();
    expect(msg).toContain("push-to-talk");
  });

  it("answers 'are you always listening'", () => {
    expect(getVoiceCapabilityMessage("are you always-on listening")).not.toBeNull();
  });

  it("answers 'do you have background listening'", () => {
    expect(getVoiceCapabilityMessage("do you have background listening")).not.toBeNull();
  });

  it("response denies background listening", () => {
    const msg = getVoiceCapabilityMessage("can you listen in the background") ?? "";
    expect(msg.toLowerCase()).toContain("no");
  });

  it("response says push-to-talk only", () => {
    const msg = getVoiceCapabilityMessage("can you listen in the background") ?? "";
    expect(msg.toLowerCase()).toContain("push-to-talk");
  });
});

describe("getVoiceCapabilityMessage — wake word questions", () => {
  it("answers 'do you have a wake word'", () => {
    const msg = getVoiceCapabilityMessage("do you have a wake word");
    expect(msg).not.toBeNull();
    expect(msg?.toLowerCase()).toContain("no wake word");
  });

  it("answers 'is there a wake word'", () => {
    expect(getVoiceCapabilityMessage("is there a wake word")).not.toBeNull();
  });
});

describe("getVoiceCapabilityMessage — TTS / speak back questions", () => {
  it("answers 'can you speak back'", () => {
    const msg = getVoiceCapabilityMessage("can you speak back");
    expect(msg).not.toBeNull();
    expect(msg?.toLowerCase()).toContain("tts");
  });

  it("answers 'do you have TTS'", () => {
    expect(getVoiceCapabilityMessage("do you have TTS")).not.toBeNull();
  });

  it("answers 'do you have text to speech'", () => {
    expect(getVoiceCapabilityMessage("do you have text-to-speech")).not.toBeNull();
  });

  it("answers 'can you talk back'", () => {
    expect(getVoiceCapabilityMessage("can you talk back")).not.toBeNull();
  });

  it("response describes Phase 3E TTS availability", () => {
    const msg = getVoiceCapabilityMessage("can you speak back") ?? "";
    expect(msg.toLowerCase()).toContain("settings");
    expect(msg.toLowerCase()).toContain("voice output");
  });
});

describe("getVoiceCapabilityMessage — unrelated questions pass through", () => {
  it("passes 'what is the weather'", () => {
    expect(getVoiceCapabilityMessage("what is the weather")).toBeNull();
  });

  it("passes 'activate focus mode'", () => {
    expect(getVoiceCapabilityMessage("activate focus mode")).toBeNull();
  });

  it("passes 'tell me about quantum computing'", () => {
    expect(getVoiceCapabilityMessage("tell me about quantum computing")).toBeNull();
  });

  it("passes 'emergency stop'", () => {
    expect(getVoiceCapabilityMessage("emergency stop")).toBeNull();
  });
});

describe("getVoiceCapabilityMessage — voice not working troubleshooting", () => {
  it("answers 'voice not working'", () => {
    const msg = getVoiceCapabilityMessage("voice not working");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Phase 3D");
  });

  it("answers 'voice doesn't work'", () => {
    expect(getVoiceCapabilityMessage("voice doesn't work")).not.toBeNull();
  });

  it("answers 'voice not responding'", () => {
    expect(getVoiceCapabilityMessage("voice not responding")).not.toBeNull();
  });

  it("response explains KeyV focus requirement", () => {
    const msg = getVoiceCapabilityMessage("voice not working") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response mentions Whisper model path requirement", () => {
    const msg = getVoiceCapabilityMessage("voice not working") ?? "";
    expect(msg.toLowerCase()).toContain("whisper model");
  });

  it("response mentions KeyV flow", () => {
    const msg = getVoiceCapabilityMessage("voice not working") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });
});

describe("getVoiceCapabilityMessage — nothing happened after voice", () => {
  it("answers 'nothing happened after voice'", () => {
    expect(getVoiceCapabilityMessage("nothing happened after voice")).not.toBeNull();
  });

  it("answers 'I asked through voice and nothing happened'", () => {
    expect(getVoiceCapabilityMessage("I asked through voice and nothing happened")).not.toBeNull();
  });

  it("answers 'why didn't Lisa answer my voice question'", () => {
    expect(getVoiceCapabilityMessage("why didn't Lisa answer my voice question")).not.toBeNull();
  });

  it("answers 'why didn't voice work'", () => {
    expect(getVoiceCapabilityMessage("why didn't voice work")).not.toBeNull();
  });

  it("response mentions model path requirement", () => {
    const msg = getVoiceCapabilityMessage("nothing happened after voice") ?? "";
    expect(msg.toLowerCase()).toContain("model path");
  });

  it("response advises setting model in Settings", () => {
    const msg = getVoiceCapabilityMessage("nothing happened after voice") ?? "";
    expect(msg.toLowerCase()).toContain("settings");
  });

  it("response advises holding the key longer", () => {
    const msg = getVoiceCapabilityMessage("nothing happened after voice") ?? "";
    expect(msg.toLowerCase()).toContain("hold");
  });
});

describe("getVoiceCapabilityMessage — KeyV not working troubleshooting", () => {
  it("answers 'keyv not working'", () => {
    expect(getVoiceCapabilityMessage("keyv not working")).not.toBeNull();
  });

  it("answers 'KeyV does nothing'", () => {
    expect(getVoiceCapabilityMessage("KeyV does nothing")).not.toBeNull();
  });

  it("answers 'push-to-talk not working'", () => {
    expect(getVoiceCapabilityMessage("push-to-talk not working")).not.toBeNull();
  });

  it("answers 'v key not working'", () => {
    expect(getVoiceCapabilityMessage("v key not working")).not.toBeNull();
  });

  it("answers 'KeyV worked once then stopped'", () => {
    expect(getVoiceCapabilityMessage("KeyV worked once then stopped")).not.toBeNull();
  });

  it("response explains command box focus blocks KeyV", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("command box");
  });

  it("response tells user to click outside first", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("click outside");
  });

  it("response does not reference a visible Start Voice UI Test button", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg).not.toContain("Start Voice UI Test");
    expect(msg.toLowerCase()).toContain("click outside");
  });
});

describe("getVoiceCapabilityMessage — mic button missing troubleshooting", () => {
  it("answers 'mic button missing'", () => {
    expect(getVoiceCapabilityMessage("mic button missing")).not.toBeNull();
  });

  it("answers 'there is no mic button'", () => {
    expect(getVoiceCapabilityMessage("there is no mic button")).not.toBeNull();
  });

  it("answers 'where is the mic button'", () => {
    expect(getVoiceCapabilityMessage("where is the mic button")).not.toBeNull();
  });

  it("answers 'can't find microphone button'", () => {
    expect(getVoiceCapabilityMessage("can't find microphone button")).not.toBeNull();
  });

  it("answers 'mic button not visible'", () => {
    expect(getVoiceCapabilityMessage("mic button not visible")).not.toBeNull();
  });

  it("response confirms Phase 3D is keyboard-only push-to-talk", () => {
    const msg = getVoiceCapabilityMessage("mic button missing") ?? "";
    expect(msg.toLowerCase()).toContain("phase 3d");
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response describes keyboard-only push-to-talk", () => {
    const msg = getVoiceCapabilityMessage("where is the mic button") ?? "";
    expect(msg.toLowerCase()).toContain("keyboard-only");
  });

  it("answers 'no mic button' phrase", () => {
    expect(getVoiceCapabilityMessage("no mic button is showing")).not.toBeNull();
  });
});

// ─── Phase 4A — screen capture commands ──────────────────────────────────────

describe("routeCommand — capture_screen (Phase 4A)", () => {
  it("routes 'capture screen'", () => {
    expect(routeCommand("capture screen").intent).toBe("capture_screen");
  });

  it("routes 'take screenshot'", () => {
    expect(routeCommand("take screenshot").intent).toBe("capture_screen");
  });

  it("routes 'take a screenshot'", () => {
    expect(routeCommand("take a screenshot").intent).toBe("capture_screen");
  });

  it("routes 'look at my screen'", () => {
    expect(routeCommand("look at my screen").intent).toBe("capture_screen");
  });

  it("routes 'look at the screen'", () => {
    expect(routeCommand("look at the screen").intent).toBe("capture_screen");
  });

  it("routes 'Lisa, capture screen' (with prefix)", () => {
    expect(routeCommand("Lisa, capture screen").intent).toBe("capture_screen");
  });

  it("has high confidence", () => {
    expect(routeCommand("capture screen").confidence).toBe("high");
  });

  it("returns a non-empty response", () => {
    expect(routeCommand("capture screen").response).toBeTruthy();
  });
});

describe("routeCommand — screen_what_can_you_see (Phase 4A)", () => {
  it("routes 'what can you see'", () => {
    expect(routeCommand("what can you see").intent).toBe("screen_what_can_you_see");
  });

  it("routes 'what do you see'", () => {
    expect(routeCommand("what do you see").intent).toBe("screen_what_can_you_see");
  });

  it("routes 'describe screen context'", () => {
    expect(routeCommand("describe screen context").intent).toBe("screen_what_can_you_see");
  });

  it("has high confidence", () => {
    expect(routeCommand("what can you see").confidence).toBe("high");
  });
});

describe("routeCommand — clear_screen_context (Phase 4A)", () => {
  it("routes 'clear screen context'", () => {
    expect(routeCommand("clear screen context").intent).toBe("clear_screen_context");
  });

  it("routes 'forget screen context'", () => {
    expect(routeCommand("forget screen context").intent).toBe("clear_screen_context");
  });

  it("routes 'clear screen'", () => {
    expect(routeCommand("clear screen").intent).toBe("clear_screen_context");
  });

  it("has high confidence", () => {
    expect(routeCommand("clear screen context").confidence).toBe("high");
  });
});

describe("routeCommand — screen_awareness_enable / screen_awareness_disable (Phase 4A)", () => {
  it("routes 'enable screen awareness'", () => {
    expect(routeCommand("enable screen awareness").intent).toBe("screen_awareness_enable");
  });

  it("routes 'turn on screen awareness'", () => {
    expect(routeCommand("turn on screen awareness").intent).toBe("screen_awareness_enable");
  });

  it("routes 'disable screen awareness'", () => {
    expect(routeCommand("disable screen awareness").intent).toBe("screen_awareness_disable");
  });

  it("routes 'turn off screen awareness'", () => {
    expect(routeCommand("turn off screen awareness").intent).toBe("screen_awareness_disable");
  });

  it("all screen awareness commands have high confidence", () => {
    const commands = ["enable screen awareness", "disable screen awareness", "turn on screen awareness"];
    for (const cmd of commands) {
      expect(routeCommand(cmd).confidence).toBe("high");
    }
  });
});

describe("getDesktopActionGuardMessage — Phase 4C OCR commands are allowed", () => {
  it("allows 'can you read my screen' to reach the capability guard", () => {
    expect(getDesktopActionGuardMessage("can you read my screen")).toBeNull();
  });

  it("'capture screen' is not blocked — explicit Phase 4A command", () => {
    expect(getDesktopActionGuardMessage("capture screen")).toBeNull();
  });

  it("'take screenshot' is not blocked", () => {
    expect(getDesktopActionGuardMessage("take screenshot")).toBeNull();
  });
});

describe("getScreenCapabilityMessage — background watching questions (Phase 4A)", () => {
  it("answers 'can you watch my screen in the background'", () => {
    const msg = getScreenCapabilityMessage("can you watch my screen in the background");
    expect(msg).not.toBeNull();
  });

  it("answers 'do you have background screen monitoring'", () => {
    expect(getScreenCapabilityMessage("do you have background screen monitoring")).not.toBeNull();
  });

  it("response says no background watching", () => {
    const msg = getScreenCapabilityMessage("can you watch my screen in the background") ?? "";
    expect(msg.toLowerCase()).toContain("no");
    expect(msg.toLowerCase()).toContain("manual");
  });

  it("response mentions Phase 4A", () => {
    const msg = getScreenCapabilityMessage("can you watch my screen in the background") ?? "";
    expect(msg).toContain("Phase 4A");
  });
});

describe("getScreenCapabilityMessage — OCR questions (Phase 4A)", () => {
  it("answers 'can you do OCR'", () => {
    const msg = getScreenCapabilityMessage("can you do OCR");
    expect(msg).not.toBeNull();
  });

  it("answers 'can you read text from the screen'", () => {
    expect(getScreenCapabilityMessage("can you read text from the screen")).not.toBeNull();
  });

  it("answers 'can you read my screen'", () => {
    const msg = getScreenCapabilityMessage("can you read my screen") ?? "";
    expect(msg).toContain("Phase 4C");
    expect(msg.toLowerCase()).toContain("read screen text");
  });

  it("response describes Phase 4C OCR capability", () => {
    const msg = getScreenCapabilityMessage("can you do OCR") ?? "";
    expect(msg.toLowerCase()).toContain("phase 4c");
    expect(msg.toLowerCase()).toContain("ocr");
  });

  it("response instructs user to run read screen text command", () => {
    const msg = getScreenCapabilityMessage("can you read text from the screen") ?? "";
    expect(msg.toLowerCase()).toContain("read screen text");
  });
});

describe("getScreenCapabilityMessage — screenshot upload questions (Phase 4A)", () => {
  it("answers 'can you upload the screenshot'", () => {
    const msg = getScreenCapabilityMessage("can you upload the screenshot");
    expect(msg).not.toBeNull();
  });

  it("answers 'can you send the screenshot'", () => {
    expect(getScreenCapabilityMessage("can you send the screenshot")).not.toBeNull();
  });

  it("response says local only — never uploaded", () => {
    const msg = getScreenCapabilityMessage("can you upload the screenshot") ?? "";
    expect(msg.toLowerCase()).toContain("local");
    expect(msg.toLowerCase()).toContain("never");
  });
});

describe("getScreenCapabilityMessage — general screen capability questions (Phase 4A)", () => {
  it("answers 'do you have screen awareness'", () => {
    const msg = getScreenCapabilityMessage("do you have screen awareness");
    expect(msg).not.toBeNull();
  });

  it("answers 'can you see my screen'", () => {
    expect(getScreenCapabilityMessage("can you see my screen")).not.toBeNull();
  });

  it("response mentions 'capture screen' command", () => {
    const msg = getScreenCapabilityMessage("do you have screen awareness") ?? "";
    expect(msg.toLowerCase()).toContain("capture screen");
  });

  it("response mentions no cloud upload", () => {
    const msg = getScreenCapabilityMessage("do you have screen awareness") ?? "";
    expect(msg.toLowerCase()).toContain("cloud");
  });
});

describe("getScreenCapabilityMessage — unrelated questions pass through (Phase 4A)", () => {
  it("passes 'what is the weather'", () => {
    expect(getScreenCapabilityMessage("what is the weather")).toBeNull();
  });

  it("passes 'activate cyber mode'", () => {
    expect(getScreenCapabilityMessage("activate cyber mode")).toBeNull();
  });

  it("passes 'emergency stop'", () => {
    expect(getScreenCapabilityMessage("emergency stop")).toBeNull();
  });

  it("passes 'tell me about machine learning'", () => {
    expect(getScreenCapabilityMessage("tell me about machine learning")).toBeNull();
  });
});

describe("routeCommand — TTS voice output commands (Phase 3E)", () => {
  it("routes 'test voice'", () => {
    expect(routeCommand("test voice").intent).toBe("tts_test_voice");
  });

  it("routes 'stop speaking'", () => {
    expect(routeCommand("stop speaking").intent).toBe("tts_stop_speaking");
  });

  it("routes 'enable voice output'", () => {
    expect(routeCommand("enable voice output").intent).toBe("tts_enable");
  });

  it("routes 'turn on voice output'", () => {
    expect(routeCommand("turn on voice output").intent).toBe("tts_enable");
  });

  it("routes 'disable voice output'", () => {
    expect(routeCommand("disable voice output").intent).toBe("tts_disable");
  });

  it("routes 'turn off voice output'", () => {
    expect(routeCommand("turn off voice output").intent).toBe("tts_disable");
  });

  it("routes 'auto speak on'", () => {
    expect(routeCommand("auto speak on").intent).toBe("tts_auto_speak_on");
  });

  it("routes 'auto speak off'", () => {
    expect(routeCommand("auto speak off").intent).toBe("tts_auto_speak_off");
  });

  it("routes 'speak again'", () => {
    expect(routeCommand("speak again").intent).toBe("tts_speak_again");
  });

  it("'repeat that' now routes to repeat_last_response (text repeat), not tts_speak_again", () => {
    expect(routeCommand("repeat that").intent).toBe("repeat_last_response");
  });

  it("all TTS commands return high confidence", () => {
    const commands = ["test voice", "stop speaking", "enable voice output", "disable voice output"];
    for (const cmd of commands) {
      expect(routeCommand(cmd).confidence).toBe("high");
    }
  });
});

describe("formatScreenContextResponse — no screen context (Phase 4A grounding)", () => {
  it("returns no-context message when status is idle", () => {
    const msg = formatScreenContextResponse({ screenStatus: "idle" });
    expect(msg).toContain("I do not have screen context yet");
  });

  it("returns no-context message when status is capturing", () => {
    const msg = formatScreenContextResponse({ screenStatus: "capturing" });
    expect(msg).toContain("I do not have screen context yet");
  });

  it("returns no-context message when status is error", () => {
    const msg = formatScreenContextResponse({ screenStatus: "error" });
    expect(msg).toContain("I do not have screen context yet");
  });

  it("returns no-context message when available but width/height missing", () => {
    const msg = formatScreenContextResponse({ screenStatus: "available" });
    expect(msg).toContain("I do not have screen context yet");
  });

  it("does not invent fake resolution in no-context response", () => {
    const msg = formatScreenContextResponse({ screenStatus: "idle" });
    expect(msg).not.toMatch(/1920|1080|2023|provider=Windows/);
  });

  it("mentions capture command in no-context response", () => {
    const msg = formatScreenContextResponse({ screenStatus: "idle" });
    expect(msg).toContain("capture screen");
  });
});

describe("formatScreenContextResponse — with screen context (Phase 4A grounding)", () => {
  const baseState = {
    screenStatus: "available" as const,
    screenWidth: 1280,
    screenHeight: 720,
    screenProvider: "windows_capture",
    screenCapturedAt: new Date("2026-06-07T17:33:09").getTime(),
  };

  it("returns grounded response with actual resolution", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).toContain("1280×720");
  });

  it("returns grounded response with actual provider", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).toContain("windows_capture");
  });

  it("does not invent fake 1920×1080 resolution", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).not.toContain("1920");
    expect(msg).not.toContain("1080");
  });

  it("does not invent fake provider string", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).not.toMatch(/provider=Windows|provider=unknown.*fake/i);
  });

  it("does not invent fake 2023 timestamp", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).not.toContain("2023-02-20");
  });

  it("distinguishes metadata response from manually requested OCR", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).toContain("read screen text");
    expect(msg).toContain("metadata");
  });

  it("states the manual OCR boundary", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).toContain("manually run 'read screen text'");
  });

  it("directs screen text questions to the deterministic OCR command", () => {
    const msg = formatScreenContextResponse(baseState);
    expect(msg).toContain("what can you read");
  });

  it("uses different provider when state says different provider", () => {
    const msg = formatScreenContextResponse({ ...baseState, screenProvider: "test_provider" });
    expect(msg).toContain("test_provider");
    expect(msg).not.toContain("windows_capture");
  });

  it("uses different resolution when state says different resolution", () => {
    const msg = formatScreenContextResponse({ ...baseState, screenWidth: 3840, screenHeight: 2160 });
    expect(msg).toContain("3840×2160");
    expect(msg).not.toContain("1280");
  });
});

describe("routeCommand — repeat_last_response routing (hotfix)", () => {
  it("routes 'say that again' to repeat_last_response", () => {
    expect(routeCommand("say that again").intent).toBe("repeat_last_response");
  });

  it("routes 'say again' to repeat_last_response", () => {
    expect(routeCommand("say again").intent).toBe("repeat_last_response");
  });

  it("routes 'repeat that' to repeat_last_response", () => {
    expect(routeCommand("repeat that").intent).toBe("repeat_last_response");
  });

  it("routes 'repeat last response' to repeat_last_response", () => {
    expect(routeCommand("repeat last response").intent).toBe("repeat_last_response");
  });

  it("routes 'repeat the last response' to repeat_last_response", () => {
    expect(routeCommand("repeat the last response").intent).toBe("repeat_last_response");
  });

  it("routes 'repeat your last response' to repeat_last_response", () => {
    expect(routeCommand("repeat your last response").intent).toBe("repeat_last_response");
  });

  it("routes 'show that again' to repeat_last_response", () => {
    expect(routeCommand("show that again").intent).toBe("repeat_last_response");
  });

  it("routes 'show me that again' to repeat_last_response", () => {
    expect(routeCommand("show me that again").intent).toBe("repeat_last_response");
  });

  it("routes 'Lisa, say that again' to repeat_last_response", () => {
    expect(routeCommand("Lisa, say that again").intent).toBe("repeat_last_response");
  });

  it("all repeat phrases return high confidence", () => {
    const phrases = ["say that again", "say again", "repeat that", "show that again"];
    for (const p of phrases) {
      expect(routeCommand(p).confidence).toBe("high");
    }
  });
});

describe("routeCommand — tts_speak_again routing preserved (hotfix)", () => {
  it("still routes 'speak again' to tts_speak_again", () => {
    expect(routeCommand("speak again").intent).toBe("tts_speak_again");
  });

  it("routes 'speak that again' to tts_speak_again", () => {
    expect(routeCommand("speak that again").intent).toBe("tts_speak_again");
  });

  it("routes 'say it out loud again' to tts_speak_again", () => {
    expect(routeCommand("say it out loud again").intent).toBe("tts_speak_again");
  });

  it("routes 'read that again' to tts_speak_again", () => {
    expect(routeCommand("read that again").intent).toBe("tts_speak_again");
  });

  it("speak-again phrases do NOT route to repeat_last_response", () => {
    expect(routeCommand("speak again").intent).not.toBe("repeat_last_response");
    expect(routeCommand("speak that again").intent).not.toBe("repeat_last_response");
  });
});

describe("findLastRepeatableResponse — helper (hotfix)", () => {
  const makeInteraction = (
    id: string,
    kind: "command" | "local_ai" | "error" | "system",
    status: "complete" | "failed" | "cancelled" | "thinking" | "streaming",
    response: string
  ) => ({
    id,
    kind,
    status,
    prompt: "test",
    response,
    createdAt: new Date().toISOString(),
  });

  it("returns latest completed command response", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "First response"),
      makeInteraction("2", "command", "complete", "Second response"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Second response");
  });

  it("returns latest completed local_ai response", () => {
    const interactions = [
      makeInteraction("1", "local_ai", "complete", "AI response A"),
      makeInteraction("2", "local_ai", "complete", "AI response B"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("AI response B");
  });

  it("searches newest to oldest — returns last item first", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Old response"),
      makeInteraction("2", "local_ai", "complete", "New response"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("New response");
  });

  it("skips failed interactions", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Good response"),
      makeInteraction("2", "command", "failed", "Error response"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Good response");
  });

  it("skips cancelled interactions", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Good response"),
      makeInteraction("2", "command", "cancelled", "Cancelled"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Good response");
  });

  it("skips streaming interactions", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Good response"),
      makeInteraction("2", "local_ai", "streaming", "Partial…"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Good response");
  });

  it("skips thinking interactions", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Good response"),
      makeInteraction("2", "local_ai", "thinking", ""),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Good response");
  });

  it("skips empty responses", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Real response"),
      makeInteraction("2", "command", "complete", "   "),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Real response");
  });

  it("skips system and error kind interactions", () => {
    const interactions = [
      makeInteraction("1", "command", "complete", "Good response"),
      makeInteraction("2", "system", "complete", "System message"),
      makeInteraction("3", "error", "complete", "Error message"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBe("Good response");
  });

  it("returns null when no repeatable response exists", () => {
    const interactions = [
      makeInteraction("1", "system", "complete", "System message"),
      makeInteraction("2", "command", "failed", "Failed"),
    ];
    expect(findLastRepeatableResponse(interactions)).toBeNull();
  });

  it("returns null for empty interactions array", () => {
    expect(findLastRepeatableResponse([])).toBeNull();
  });

  it("preserves grounded screen response exactly — no fake metadata", () => {
    const groundedResponse = [
      "I have manual screen context from the latest capture:",
      "- Resolution: 1280×720",
      "- Provider: windows_capture",
      "- Captured: 6:07:45 PM",
      "",
      "I can report capture metadata here. Screen text is available only after you manually run 'read screen text' and ask 'what can you read'. I cannot infer other visual details or control the desktop.",
    ].join("\n");
    const interactions = [makeInteraction("1", "command", "complete", groundedResponse)];
    const result = findLastRepeatableResponse(interactions);
    expect(result).toBe(groundedResponse);
    expect(result).toContain("1280×720");
    expect(result).toContain("windows_capture");
    expect(result).not.toContain("1920");
    expect(result).not.toContain("1080");
    expect(result).not.toContain("2023-02-20");
    expect(result).not.toMatch(/provider=Windows/i);
  });
});

// ─── OCR command routing ──────────────────────────────────────────────────────

describe("routeCommand — run_screen_ocr", () => {
  it("routes 'read screen text'", () => {
    expect(routeCommand("read screen text").intent).toBe("run_screen_ocr");
  });
  it("routes 'run ocr'", () => {
    expect(routeCommand("run ocr").intent).toBe("run_screen_ocr");
  });
  it("routes 'extract screen text'", () => {
    expect(routeCommand("extract screen text").intent).toBe("run_screen_ocr");
  });
  it("routes 'scan screen text'", () => {
    expect(routeCommand("scan screen text").intent).toBe("run_screen_ocr");
  });
  it("routes 'ocr screen'", () => {
    expect(routeCommand("ocr screen").intent).toBe("run_screen_ocr");
  });
  it("routes with Lisa prefix", () => {
    expect(routeCommand("Lisa, read screen text").intent).toBe("run_screen_ocr");
  });
  it("has high confidence", () => {
    expect(routeCommand("read screen text").confidence).toBe("high");
  });
});

describe("routeCommand — screen_what_can_you_read", () => {
  const aliases = [
    "what can you read",
    "what you can read",
    "what do you read",
    "what did you read",
    "what can you read from the screen",
    "what text can you read",
    "what text is on my screen",
    "what text can you see",
    "show screen text",
    "read extracted screen text",
  ];

  it.each(aliases)("routes '%s' deterministically", (command) => {
    const route = routeCommand(command);
    expect(route.intent).toBe("screen_what_can_you_read");
    expect(route.intent).not.toBe("unknown");
  });
  it("has high confidence", () => {
    expect(routeCommand("what can you read").confidence).toBe("high");
  });
});

describe("routeCommand — Phase 4D grounded screen reasoning", () => {
  const cases = [
    ["explain what you read", "screen_explain"],
    ["explain the screen text", "screen_explain"],
    ["explain this screen", "screen_explain"],
    ["explain what is on my screen", "screen_explain"],
    ["explain the visible text", "screen_explain"],
    ["summarize this screen", "screen_summarize"],
    ["summarize the screen", "screen_summarize"],
    ["summarize screen text", "screen_summarize"],
    ["summarize what you read", "screen_summarize"],
    ["give me a summary of the screen", "screen_summarize"],
    ["what is this page about", "screen_page_about"],
    ["what is this screen about", "screen_page_about"],
    ["what am I looking at", "screen_page_about"],
    ["what is open on my screen", "screen_page_about"],
    ["what should I do next based on the screen", "screen_next_steps"],
    ["suggest next steps from the screen", "screen_next_steps"],
    ["help me with this screen", "screen_next_steps"],
    ["guide me through this screen", "screen_next_steps"],
    ["is there an error on the screen", "screen_find_errors"],
    ["find errors on the screen", "screen_find_errors"],
    ["explain the error on the screen", "screen_find_errors"],
    ["what error do you see", "screen_find_errors"],
    ["extract action items from the screen", "screen_extract_action_items"],
    ["find tasks on the screen", "screen_extract_action_items"],
    ["what are the action items", "screen_extract_action_items"],
  ] as const;

  it.each(cases)("routes '%s' to %s", (command, intent) => {
    const result = routeCommand(command);
    expect(result.intent).toBe(intent);
    expect(result.confidence).toBe("high");
  });

  it("routes ambiguous next-step wording only when OCR context exists", () => {
    expect(routeCommand("what should I do next").intent).toBe("unknown");
    expect(
      routeCommand("what should I do next", { hasUsableOcrText: true }).intent
    ).toBe("screen_next_steps");
  });

  it.each(["what should I eat", "what should I do with my life", "yo", "hello"])(
    "does not over-route casual message '%s'",
    (command) => {
      expect(routeCommand(command).intent).not.toMatch(/^screen_/);
    }
  );
});

describe("routeCommand — clear_screen_text", () => {
  it("routes 'clear screen text'", () => {
    expect(routeCommand("clear screen text").intent).toBe("clear_screen_text");
  });
  it("routes 'forget screen text'", () => {
    expect(routeCommand("forget screen text").intent).toBe("clear_screen_text");
  });
  it("routes 'delete screen text'", () => {
    expect(routeCommand("delete screen text").intent).toBe("clear_screen_text");
  });
  it("has high confidence", () => {
    expect(routeCommand("clear screen text").confidence).toBe("high");
  });
});

describe("routeCommand — check_ocr_status", () => {
  it("routes 'check ocr'", () => {
    expect(routeCommand("check ocr").intent).toBe("check_ocr_status");
  });
  it("routes 'check ocr status'", () => {
    expect(routeCommand("check ocr status").intent).toBe("check_ocr_status");
  });
  it("routes 'ocr status'", () => {
    expect(routeCommand("ocr status").intent).toBe("check_ocr_status");
  });
  it("has high confidence", () => {
    expect(routeCommand("check ocr").confidence).toBe("high");
  });
});

// ─── formatOcrResponse ────────────────────────────────────────────────────────

describe("formatOcrResponse", () => {
  it("returns no-text message when status is idle", () => {
    const result = formatOcrResponse({ screenOcrStatus: "idle" });
    expect(result).toContain("do not have extracted screen text");
    expect(result).toContain("read screen text");
  });

  it("returns no-text message when status is error", () => {
    const result = formatOcrResponse({ screenOcrStatus: "error" });
    expect(result).toContain("do not have extracted screen text");
  });

  it("returns no-text message when status is running", () => {
    const result = formatOcrResponse({ screenOcrStatus: "running" });
    expect(result).toContain("do not have extracted screen text");
  });

  it("returns no-text message when status is available but text is empty", () => {
    const result = formatOcrResponse({ screenOcrStatus: "available", screenOcrText: "" });
    expect(result).toContain("do not have extracted screen text");
  });

  it("returns grounded OCR response when status is available with text", () => {
    const result = formatOcrResponse({
      screenOcrStatus: "available",
      screenOcrText: "Hello from screen",
      screenOcrChars: 18,
      screenOcrLines: 1,
      screenOcrProvider: "windows_ocr",
    });
    expect(result).toContain("Hello from screen");
    expect(result).toContain("Lines: 1");
    expect(result).toContain("Characters: 18");
    expect(result).toContain("windows_ocr");
  });

  it("truncates long OCR text at 500 chars", () => {
    const longText = "A".repeat(600);
    const result = formatOcrResponse({
      screenOcrStatus: "available",
      screenOcrText: longText,
      screenOcrChars: 600,
      screenOcrLines: 1,
      screenOcrProvider: "windows_ocr",
    });
    expect(result).toContain("… [truncated]");
    expect(result).not.toContain("A".repeat(601));
  });

  it("does not truncate text under 500 chars", () => {
    const shortText = "Short text content.";
    const result = formatOcrResponse({
      screenOcrStatus: "available",
      screenOcrText: shortText,
      screenOcrChars: shortText.length,
      screenOcrLines: 1,
      screenOcrProvider: "windows_ocr",
    });
    expect(result).toContain(shortText);
    expect(result).not.toContain("… [truncated]");
  });

  it("acknowledges OCR imperfection in response", () => {
    const result = formatOcrResponse({
      screenOcrStatus: "available",
      screenOcrText: "Some text",
      screenOcrChars: 9,
      screenOcrLines: 1,
      screenOcrProvider: "windows_ocr",
    });
    expect(result).toMatch(/imperfect|cannot infer/i);
  });

  it("does not invent metadata when provider/lines are missing", () => {
    const result = formatOcrResponse({
      screenOcrStatus: "available",
      screenOcrText: "Hello",
    });
    expect(result).toContain("Hello");
    expect(result).toContain("Lines: 0");
    expect(result).toContain("Characters: 0");
  });
});
