export type ParticipantKind = "human" | "agent";
export type ParticipantStatus = "idle" | "thinking" | "error";
export type MessageKind = "human" | "agent" | "system";

export type SkillBarParticipant = {
  id: string;
  name: string;
  kind: ParticipantKind;
  status: ParticipantStatus;
  needsGreeting: boolean;
  hasSession: boolean;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SkillBarMessage = {
  seq: number;
  id: string;
  senderId: string | null;
  senderName: string;
  senderKind: MessageKind;
  content: string;
  createdAt: number;
};

export type AnthropicSettingsSnapshot = {
  apiKeyConfigured: boolean;
  authTokenConfigured: boolean;
  baseUrlConfigured: boolean;
  credentialsConfigured: boolean;
};

export type SkillBarSnapshot = {
  anthropic: AnthropicSettingsSnapshot;
  participants: SkillBarParticipant[];
  messages: SkillBarMessage[];
  latestSeq: number;
};
