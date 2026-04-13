import "server-only";

import type { AgentRuntimeSummary } from "@/lib/skillbar-types";

const DEFAULT_ANTHROPIC_MODEL = "anthropic:claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL = "openai:gpt-5.4";

function formatProvider(provider: string) {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google-genai":
      return "Google";
    case "openrouter":
      return "OpenRouter";
    case "fireworks":
      return "Fireworks";
    case "azure_openai":
      return "Azure OpenAI";
    case "ollama":
      return "Ollama";
    default:
      return provider;
  }
}

function getRequiredEnv(model: string) {
  if (model.startsWith("anthropic:")) {
    return "ANTHROPIC_API_KEY";
  }

  if (model.startsWith("openai:")) {
    return "OPENAI_API_KEY";
  }

  if (model.startsWith("google-genai:")) {
    return "GOOGLE_API_KEY";
  }

  if (model.startsWith("openrouter:")) {
    return "OPENROUTER_API_KEY";
  }

  if (model.startsWith("fireworks:")) {
    return "FIREWORKS_API_KEY";
  }

  if (model.startsWith("azure_openai:")) {
    return "AZURE_OPENAI_API_KEY";
  }

  return null;
}

export function getAgentModel() {
  const explicitModel = process.env.DEEPAGENT_MODEL?.trim();

  if (explicitModel) {
    return explicitModel;
  }

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return DEFAULT_ANTHROPIC_MODEL;
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return DEFAULT_OPENAI_MODEL;
  }

  return DEFAULT_ANTHROPIC_MODEL;
}

export function getAgentRuntimeSummary(): AgentRuntimeSummary {
  const model = getAgentModel();
  const provider = formatProvider(model.split(":")[0] ?? "unknown");
  const requiredEnv = getRequiredEnv(model);

  return {
    missingEnv: requiredEnv && !process.env[requiredEnv]?.trim() ? requiredEnv : null,
    model,
    provider,
    ready: !requiredEnv || Boolean(process.env[requiredEnv]?.trim()),
  };
}

export function assertAgentRuntimeReady() {
  const runtime = getAgentRuntimeSummary();

  if (!runtime.ready) {
    throw new Error(`${runtime.missingEnv} is required for ${runtime.model}.`);
  }

  return runtime;
}
