import { describe, it, expect } from "vitest";
import { routeCommand, getDesktopActionGuardMessage, getVoiceCapabilityMessage } from "../core/command-router";

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
  it("blocks 'can you read my screen'", () => {
    expect(getDesktopActionGuardMessage("can you read my screen")).not.toBeNull();
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
  it("blocks 'capture the screen'", () => {
    expect(getDesktopActionGuardMessage("capture the screen")).not.toBeNull();
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
    expect(msg.toLowerCase()).toContain("whisper model");
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

  it("routes 'repeat that'", () => {
    expect(routeCommand("repeat that").intent).toBe("tts_speak_again");
  });

  it("all TTS commands return high confidence", () => {
    const commands = ["test voice", "stop speaking", "enable voice output", "disable voice output"];
    for (const cmd of commands) {
      expect(routeCommand(cmd).confidence).toBe("high");
    }
  });
});
