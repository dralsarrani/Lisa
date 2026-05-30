import { describe, it, expect } from "vitest";
import { classifyOllamaError } from "../core/ollama-error";

describe("classifyOllamaError", () => {
  describe("memory allocation failures", () => {
    it("classifies 'unable to allocate'", () => {
      const msg = classifyOllamaError("unable to allocate CPU buffer");
      expect(msg).toContain("could not allocate enough memory");
      expect(msg).toContain("llama3.2:1b");
      expect(msg).toContain("qwen2.5-coder:1.5b");
      expect(msg).toContain("deepseek-r1:1.5b");
    });

    it("classifies 'llama runner process has terminated'", () => {
      const msg = classifyOllamaError("llama runner process has terminated");
      expect(msg).toContain("could not allocate enough memory");
    });

    it("classifies 'out of memory'", () => {
      const msg = classifyOllamaError("out of memory: kill process");
      expect(msg).toContain("could not allocate enough memory");
    });

    it("classifies 'failed to allocate'", () => {
      const msg = classifyOllamaError("failed to allocate buffer of size 8192");
      expect(msg).toContain("could not allocate enough memory");
    });

    it("is case-insensitive", () => {
      const msg = classifyOllamaError("UNABLE TO ALLOCATE CPU BUFFER");
      expect(msg).toContain("could not allocate enough memory");
    });
  });

  describe("model not found", () => {
    it("classifies 'model not found'", () => {
      const msg = classifyOllamaError("model not found");
      expect(msg).toContain("ollama pull");
    });

    it("classifies 'pull model manifest'", () => {
      const msg = classifyOllamaError("pull model manifest: file does not exist");
      expect(msg).toContain("ollama pull");
    });
  });

  describe("connection refused / Ollama offline", () => {
    it("classifies 'connection refused'", () => {
      const msg = classifyOllamaError("connection refused");
      expect(msg).toContain("ollama serve");
    });

    it("classifies 'not reachable'", () => {
      const msg = classifyOllamaError("Ollama not reachable at http://127.0.0.1:11434");
      expect(msg).toContain("ollama serve");
    });

    it("classifies 'failed to connect'", () => {
      const msg = classifyOllamaError("failed to connect to host");
      expect(msg).toContain("ollama serve");
    });
  });

  describe("disk space", () => {
    it("classifies 'no space left'", () => {
      const msg = classifyOllamaError("no space left on device");
      expect(msg).toContain("disk space");
    });

    it("classifies 'disk full'", () => {
      const msg = classifyOllamaError("disk full");
      expect(msg).toContain("disk space");
    });
  });

  describe("timeout", () => {
    it("classifies 'timed out'", () => {
      const msg = classifyOllamaError("request timed out after 15s");
      expect(msg.toLowerCase()).toMatch(/timeout|slow/);
    });

    it("classifies 'deadline exceeded'", () => {
      const msg = classifyOllamaError("deadline exceeded");
      expect(msg.toLowerCase()).toMatch(/timeout|slow/);
    });
  });

  describe("malformed response", () => {
    it("classifies 'response parse error'", () => {
      const msg = classifyOllamaError("response parse error: unexpected token");
      expect(msg).toContain("unexpected response");
    });

    it("classifies 'invalid json'", () => {
      const msg = classifyOllamaError("invalid json at position 0");
      expect(msg).toContain("unexpected response");
    });
  });

  describe("unknown errors", () => {
    it("passes through unknown errors unchanged", () => {
      const raw = "some truly unknown error 99999";
      expect(classifyOllamaError(raw)).toBe(raw);
    });

    it("passes through empty string unchanged", () => {
      expect(classifyOllamaError("")).toBe("");
    });
  });
});
