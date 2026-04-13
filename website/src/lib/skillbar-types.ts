export type ParticipantKind = "human" | "agent";
export type ParticipantStatus = "idle" | "thinking" | "error";
export type MessageKind = "human" | "agent" | "system";

export type AgentRuntimeSummary = {
  missingEnv: string | null;
  model: string;
  provider: string;
  ready: boolean;
};

export type AuthProviderFlags = {
  email: boolean;
  github: boolean;
  linuxdo: boolean;
};

export type SkillBarParticipant = {
  createdAt: number;
  hasThread: boolean;
  id: string;
  kind: ParticipantKind;
  lastError: string | null;
  name: string;
  needsGreeting: boolean;
  status: ParticipantStatus;
  updatedAt: number;
};

export type SkillBarMessage = {
  content: string;
  createdAt: number;
  id: string;
  senderId: string | null;
  senderKind: MessageKind;
  senderName: string;
  seq: number;
};

export type SkillBarSnapshot = {
  latestSeq: number;
  messages: SkillBarMessage[];
  participants: SkillBarParticipant[];
  workspace: {
    ownerName: string;
    runtime: AgentRuntimeSummary;
    title: string;
  };
};
