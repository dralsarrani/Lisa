/**
 * Maps raw Ollama error strings to user-friendly messages with actionable guidance.
 * Mirrors the Rust-side classify_ollama_error() so both streaming and non-streaming
 * error paths produce consistent messages in the Console.
 */
export function classifyOllamaError(raw: string): string {
  const lower = raw.toLowerCase();

  if (
    lower.includes("unable to allocate") ||
    lower.includes("failed to allocate") ||
    lower.includes("llama runner process has terminated") ||
    lower.includes("out of memory") ||
    lower.includes("cannot allocate")
  ) {
    return (
      "This model failed to load because Ollama could not allocate enough memory. " +
      "Try a smaller model such as llama3.2:1b, qwen2.5-coder:1.5b, or deepseek-r1:1.5b."
    );
  }

  if (lower.includes("model not found") || lower.includes("pull model manifest")) {
    return "Model not found. Make sure it is installed by running: ollama pull <model-name>";
  }

  if (
    lower.includes("connection refused") ||
    lower.includes("tcp connect error") ||
    lower.includes("not reachable") ||
    lower.includes("failed to connect")
  ) {
    return "Ollama is not running. Start it with: ollama serve";
  }

  if (
    lower.includes("no space left") ||
    lower.includes("disk full") ||
    lower.includes("not enough space")
  ) {
    return (
      "Ollama could not load the model because disk space is insufficient. " +
      "Free up disk space and try again."
    );
  }

  if (lower.includes("timed out") || lower.includes("deadline exceeded")) {
    return (
      "Local model did not respond before the timeout. " +
      "First responses can be slow while Ollama loads the model. " +
      "Try again, choose a smaller model, or restart Ollama."
    );
  }

  if (
    lower.includes("parse error") ||
    lower.includes("invalid json") ||
    lower.includes("unexpected token") ||
    lower.includes("response parse error")
  ) {
    return (
      "Ollama returned an unexpected response. " +
      "The model may have failed to load correctly. Try restarting Ollama."
    );
  }

  return raw;
}
