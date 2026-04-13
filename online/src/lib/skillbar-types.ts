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

export type AuthProviderFlags = {
  email: boolean;
  github: boolean;
  linuxdo: boolean;
};

export type ViewerSnapshot = {
  authenticated: boolean;
  canSendMessage: boolean;
  email: string | null;
  id: string | null;
  isAdmin: boolean;
  messageIntervalMs: number;
  name: string | null;
  nextAllowedMessageAt: number | null;
  participantId: string | null;
  remainingCooldownMs: number;
};

export type RuntimeSnapshot = {
  ready: boolean;
};

export type SkillBarSnapshot = {
  latestSeq: number;
  messages: SkillBarMessage[];
  participants: SkillBarParticipant[];
  runtime: RuntimeSnapshot;
  viewer: ViewerSnapshot;
};

export type SkillBarBootstrap = {
  authProviders: AuthProviderFlags;
  snapshot: SkillBarSnapshot;
};
