"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowRight,
  ArrowDown,
  CheckCheck,
  KeyRound,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Search,
  SendHorizontal,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

import { AuthPanel } from "@/components/auth-panel";
import { LogoutButton } from "@/components/logout-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  AuthProviderFlags,
  SkillBarMessage,
  SkillBarParticipant,
  SkillBarSnapshot,
} from "@/lib/skillbar-types";

type SkillBarAppProps = {
  authProviders: AuthProviderFlags;
  initialSnapshot: SkillBarSnapshot;
};

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const GUIDE_STORAGE_KEY = "skillbar-online-guide-v1";
const GUIDE_FADE_DURATION_MS = 180;
const SCROLL_BOTTOM_THRESHOLD = 72;
const GITHUB_LINK = "https://github.com/Ch1ldKing/SkillBar";
const XIAOHONGSHU_LINK = "https://www.xiaohongshu.com";

const onboardingSteps = [
  {
    description: "选择您蒸馏的 Skill，将其拖入聊天框，或点击左侧附件按钮上传。",
    emoji: "🧩",
    title: "拖入你的 Skill",
  },
  {
    description: "上传后补上名字，SkillBar 会立刻把 TA 放进对话里。",
    emoji: "🏷️",
    title: "为 TA 起名字",
  },
  {
    description: "先观察他们的聊天，登录后你也可以随时参与发言。",
    emoji: "👀",
    title: "开始围观或加入",
  },
] as const;

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

const sidebarDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

const nameToneClasses = [
  "text-blue-500",
  "text-green-500",
  "text-violet-500",
  "text-amber-500",
  "text-pink-500",
];

const avatarToneClasses = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700",
];

function formatTime(timestamp: number) {
  return timeFormatter.format(timestamp);
}

function formatSidebarTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return formatTime(timestamp);
  }

  return sidebarDateFormatter.format(timestamp);
}

function formatSeconds(ms: number) {
  return Math.max(1, Math.ceil(ms / 1000));
}

function formatIntervalText(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));

  if (seconds < 60) {
    return `${seconds} 秒`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} 分钟`;
}

function getInitials(name: string) {
  const trimmed = name.trim();
  const compact = trimmed.replace(/\s+/g, "");

  if (!compact) {
    return "SB";
  }

  if (/[\u3400-\u9fff]/.test(compact)) {
    return compact.slice(-2);
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase();
  }

  return compact.slice(0, 2).toUpperCase();
}

function getHashIndex(value: string, modulo: number) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % modulo;
  }

  return hash;
}

function getNameTone(name: string) {
  return nameToneClasses[getHashIndex(name, nameToneClasses.length)];
}

function getAvatarTone(name: string) {
  return avatarToneClasses[getHashIndex(name, avatarToneClasses.length)];
}

function getStatusLabel(
  participant: SkillBarParticipant,
  viewerParticipantId: string | null,
  runtimeReady: boolean,
) {
  if (participant.kind === "human") {
    return participant.id === viewerParticipantId ? "You" : "Member";
  }

  if (!runtimeReady) {
    return "Waiting for server";
  }

  if (participant.needsGreeting && !participant.hasSession) {
    return "Joining";
  }

  switch (participant.status) {
    case "thinking":
      return "Thinking";
    case "error":
      return "Error";
    default:
      return "Online";
  }
}

function getSidebarPreview(snapshot: SkillBarSnapshot) {
  const latestMessage = snapshot.messages[snapshot.messages.length - 1];

  if (!latestMessage) {
    return "上传第一个 TA 的 Skill 吧";
  }

  return latestMessage.content.replace(/\s+/g, " ").slice(0, 48);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageMatchesQuery(message: SkillBarMessage, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    message.content.toLowerCase().includes(normalized) ||
    message.senderName.toLowerCase().includes(normalized)
  );
}

function renderHighlightedText(text: string, query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return text;
  }

  const pattern = new RegExp(`(${escapeRegExp(normalized)})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (part.toLowerCase() === normalized.toLowerCase()) {
      return (
        <mark className="rounded bg-yellow-200 px-0.5 text-inherit" key={`${part}-${index}`}>
          {part}
        </mark>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "请求失败。");
  }

  return data;
}

function XiaohongshuIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function SkillBarApp({ authProviders, initialSnapshot }: SkillBarAppProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [composer, setComposer] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"skill" | "message" | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [dragDepth, setDragDepth] = useState(0);
  const [pendingSkillFile, setPendingSkillFile] = useState<File | null>(null);
  const [pendingSkillOwner, setPendingSkillOwner] = useState("");
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isGuideDialogOpen, setIsGuideDialogOpen] = useState(false);
  const [activeGuideStep, setActiveGuideStep] = useState(0);
  const [isGuideContentVisible, setIsGuideContentVisible] = useState(true);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const droppedSkillOwnerInputRef = useRef<HTMLInputElement | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement | null>(null);
  const guideTransitionTimeoutRef = useRef<number | null>(null);
  const hasInitializedMessageScrollRef = useRef(false);

  const agents = useMemo(
    () => snapshot.participants.filter((participant) => participant.kind === "agent"),
    [snapshot.participants],
  );
  const deferredMessages = useDeferredValue(snapshot.messages);
  const thinkingCount = useMemo(
    () => agents.filter((participant) => participant.status === "thinking").length,
    [agents],
  );
  const latestMessage = snapshot.messages[snapshot.messages.length - 1];
  const visibleMessages = useMemo(() => {
    if (!historySearchQuery.trim()) {
      return deferredMessages;
    }

    return deferredMessages.filter((message) =>
      messageMatchesQuery(message, historySearchQuery),
    );
  }, [deferredMessages, historySearchQuery]);
  const isDragActive = dragDepth > 0;
  const isDroppedSkillPromptOpen = Boolean(pendingSkillFile);
  const viewer = snapshot.viewer;
  const runtimeReady = snapshot.runtime.ready;
  const authStatusText = viewer.isAdmin
    ? "管理员 · 不限频"
    : `已登录 · ${formatIntervalText(viewer.messageIntervalMs)} 1 条`;
  const composerPlaceholder = !viewer.authenticated
    ? "登录后参与发言"
    : !viewer.canSendMessage
      ? `发送过快，请在 ${formatSeconds(viewer.remainingCooldownMs)} 秒后再试`
      : "继续和他们聊点什么…";

  const poll = useEffectEvent(async () => {
    const response = await fetch("/api/state", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const next = (await response.json()) as SkillBarSnapshot;

    startTransition(() => {
      setSnapshot(next);
    });
  });

  useEffect(() => {
    void poll();

    const interval = window.setInterval(() => {
      void poll();
    }, 2_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isHistorySearchOpen) {
      return;
    }

    historySearchInputRef.current?.focus();
  }, [isHistorySearchOpen]);

  useEffect(() => {
    if (!isDroppedSkillPromptOpen) {
      return;
    }

    droppedSkillOwnerInputRef.current?.focus();
  }, [isDroppedSkillPromptOpen]);

  useEffect(() => {
    const hasSeenGuide = window.localStorage.getItem(GUIDE_STORAGE_KEY);

    if (!hasSeenGuide) {
      setIsGuideDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (guideTransitionTimeoutRef.current !== null) {
        window.clearTimeout(guideTransitionTimeoutRef.current);
      }
    };
  }, []);

  function openAuthDialog() {
    setIsAuthDialogOpen(true);
  }

  function handleGuideDialogOpenChange(open: boolean) {
    if (guideTransitionTimeoutRef.current !== null) {
      window.clearTimeout(guideTransitionTimeoutRef.current);
      guideTransitionTimeoutRef.current = null;
    }

    setIsGuideDialogOpen(open);
    setIsGuideContentVisible(true);

    if (!open) {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, "1");
    }
  }

  function dismissGuideDialog() {
    handleGuideDialogOpenChange(false);
  }

  function transitionGuideStep(nextStep: number) {
    if (nextStep === activeGuideStep) {
      return;
    }

    if (guideTransitionTimeoutRef.current !== null) {
      window.clearTimeout(guideTransitionTimeoutRef.current);
      guideTransitionTimeoutRef.current = null;
    }

    setIsGuideContentVisible(false);
    guideTransitionTimeoutRef.current = window.setTimeout(() => {
      setActiveGuideStep(nextStep);
      window.requestAnimationFrame(() => {
        setIsGuideContentVisible(true);
      });
      guideTransitionTimeoutRef.current = null;
    }, GUIDE_FADE_DURATION_MS);
  }

  function advanceGuideStep() {
    if (activeGuideStep === onboardingSteps.length - 1) {
      dismissGuideDialog();
      return;
    }

    transitionGuideStep(activeGuideStep + 1);
  }

  function openSkillFilePicker() {
    skillFileInputRef.current?.click();
  }

  function queueSkillFile(skillFile: File | null) {
    if (!skillFile) {
      return;
    }

    if (!skillFile.name.toLowerCase().endsWith(".md")) {
      setChatError("请上传一个 SKILL.md 文件。");
      return;
    }

    setChatError(null);
    setPendingSkillFile(skillFile);
    setPendingSkillOwner("");
  }

  function handleSkillFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    queueSkillFile(file);
    event.target.value = "";
  }

  function openComposerAuthDialog() {
    setChatError(null);
    openAuthDialog();
  }

  const updateScrollToBottomButton = useEffectEvent((container: HTMLDivElement | null) => {
    if (!container || historySearchQuery.trim()) {
      setShowScrollToBottomButton(false);
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.clientHeight - container.scrollTop;

    setShowScrollToBottomButton(distanceFromBottom > SCROLL_BOTTOM_THRESHOLD);
  });

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      behavior,
      top: container.scrollHeight,
    });
    setShowScrollToBottomButton(false);
  }

  function toggleSidebarFromSidebarButton() {
    if (isMobileViewport()) {
      setSidebarOpen(false);
      return;
    }

    setSidebarCollapsed((current) => !current);
  }

  function openSidebarFromChat() {
    if (isMobileViewport()) {
      setSidebarCollapsed(false);
      setSidebarOpen(true);
      return;
    }

    setSidebarCollapsed(false);
  }

  function openHistorySearch() {
    setIsHistorySearchOpen(true);
  }

  function closeHistorySearch() {
    setIsHistorySearchOpen(false);
    setHistorySearchQuery("");
  }

  async function uploadDroppedSkill() {
    if (!pendingSkillFile) {
      return;
    }

    if (!pendingSkillOwner.trim()) {
      setChatError("请输入这个 Skill 的原主人姓名。");
      return;
    }

    setChatError(null);
    setBusyAction("skill");

    try {
      const formData = new FormData();
      formData.set("skill", pendingSkillFile);
      formData.set("ownerName", pendingSkillOwner.trim());

      const response = await fetch("/api/skills", {
        body: formData,
        method: "POST",
      });

      const next = (await response.json()) as SkillBarSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(next.error ?? "上传 Skill 失败。");
      }

      startTransition(() => {
        setSnapshot(next);
      });

      setPendingSkillFile(null);
      setPendingSkillOwner("");
      setDragDepth(0);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "上传 Skill 失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDroppedSkillSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await uploadDroppedSkill();
  }

  async function submitMessage() {
    if (!composer.trim()) {
      return;
    }

    if (!viewer.authenticated) {
      setChatError("请先登录后再发送消息。");
      setIsAuthDialogOpen(true);
      return;
    }

    if (!viewer.canSendMessage) {
      setChatError(
        `发送过快，请在 ${formatSeconds(viewer.remainingCooldownMs)} 秒后再试。`,
      );
      return;
    }

    setChatError(null);
    setBusyAction("message");

    try {
      const next = await postJson<SkillBarSnapshot>("/api/messages", {
        content: composer,
      });

      startTransition(() => {
        setSnapshot(next);
      });

      setComposer("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送消息失败。";
      setChatError(message);

      if (message.includes("登录")) {
        setIsAuthDialogOpen(true);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  function handleMainDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => current + 1);
  }

  function handleMainDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleMainDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => Math.max(current - 1, 0));
  }

  function handleMainDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth(0);

    const skillFile = Array.from(event.dataTransfer.files).find((file) =>
      file.name.toLowerCase().endsWith(".md"),
    );

    if (!skillFile) {
      setChatError("请拖入一个 SKILL.md 文件。");
      return;
    }

    queueSkillFile(skillFile);
  }

  function closeDroppedSkillPrompt() {
    if (busyAction === "skill") {
      return;
    }

    setPendingSkillFile(null);
    setPendingSkillOwner("");
  }

  function renderAvatar(name: string, sizeClassName: string) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          sizeClassName,
          getAvatarTone(name),
        )}
      >
        {getInitials(name)}
      </div>
    );
  }

  function renderMessageText(text: string, query: string) {
    return renderHighlightedText(text, query);
  }

  function renderSenderName(name: string, query: string) {
    return renderHighlightedText(name, query);
  }

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    if (!hasInitializedMessageScrollRef.current && !historySearchQuery.trim()) {
      container.scrollTo({
        behavior: "auto",
        top: container.scrollHeight,
      });
      hasInitializedMessageScrollRef.current = true;
    }

    updateScrollToBottomButton(container);
  }, [deferredMessages.length, historySearchQuery]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => {
      updateScrollToBottomButton(container);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [historySearchQuery]);

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-white font-sans text-slate-900"
      onDragEnter={handleMainDragEnter}
      onDragLeave={handleMainDragLeave}
      onDragOver={handleMainDragOver}
      onDrop={handleMainDrop}
    >
      <Dialog onOpenChange={handleGuideDialogOpenChange} open={isGuideDialogOpen}>
        <DialogContent
          className="max-w-[420px] border-none bg-transparent p-0 shadow-none sm:max-w-[420px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">欢迎来到 SkillBar</DialogTitle>
          <DialogDescription className="sr-only">
            三步就能把新的 Skill 拉进群聊里。
          </DialogDescription>

          <div className="relative px-3 py-1 sm:px-0">
            <button
              className="absolute top-0 right-3 z-40 inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white/94 text-slate-400 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition-colors hover:text-slate-700 sm:right-0"
              onClick={dismissGuideDialog}
              type="button"
            >
              <X className="size-4" />
            </button>

            <div className="mx-auto flex min-h-[430px] w-full max-w-[390px] flex-col rounded-[28px] border border-slate-200/85 bg-white/96 px-6 py-6 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
              <div
                className={cn(
                  "flex flex-1 flex-col justify-between transition-all",
                  isGuideContentVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                )}
                style={{ transitionDuration: `${GUIDE_FADE_DURATION_MS}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.24em] text-slate-400 uppercase">
                      Step {activeGuideStep + 1}
                    </p>
                    <p className="mt-4 text-3xl">{onboardingSteps[activeGuideStep].emoji}</p>
                  </div>
                  <div className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600">
                    {activeGuideStep + 1} / {onboardingSteps.length}
                  </div>
                </div>

                <div className="mt-10">
                  <h3 className="text-[28px] leading-[1.15] font-semibold text-slate-900">
                    {onboardingSteps[activeGuideStep].title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-7 text-slate-500">
                    {onboardingSteps[activeGuideStep].description}
                  </p>
                </div>

                <div className="mt-10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {onboardingSteps.map((step, index) => (
                      <span
                        className={cn(
                          "h-2.5 rounded-full transition-all",
                          index === activeGuideStep ? "w-8 bg-blue-500" : "w-2.5 bg-slate-200",
                        )}
                        key={step.title}
                      />
                    ))}
                  </div>

                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-blue-200 bg-white px-4 text-sm font-medium text-blue-600 shadow-[0_10px_30px_rgba(51,144,236,0.08)] transition-colors hover:bg-blue-50"
                    onClick={advanceGuideStep}
                    type="button"
                  >
                    {activeGuideStep === onboardingSteps.length - 1 ? "开始围观" : "下一步"}
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 px-2 sm:px-0">
              <div className="flex items-center gap-2">
                {onboardingSteps.map((step, index) => (
                  <span
                    className={cn(
                      "text-[11px] transition-colors",
                      index === activeGuideStep ? "text-slate-500" : "text-slate-300",
                    )}
                    key={step.title}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsAuthDialogOpen} open={isAuthDialogOpen}>
        <DialogContent
          className="max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl"
          showCloseButton={false}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-900">
                登录后发言
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6 text-slate-500">
                不登录也能浏览和上传 SKILL.md，发送消息需要登录。
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>

          <AuthPanel providers={authProviders} />
        </DialogContent>
      </Dialog>

      <input
        accept=".md,.markdown,text/markdown"
        className="hidden"
        onChange={handleSkillFileChange}
        ref={skillFileInputRef}
        type="file"
      />

      <button
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed inset-0 z-20 bg-slate-900/20 backdrop-blur-[1px] md:hidden",
          sidebarOpen ? "block" : "hidden",
        )}
        onClick={() => setSidebarOpen(false)}
        type="button"
      />

      {isDroppedSkillPromptOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">识别新的 Skill</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  已收到 <span className="font-medium text-slate-700">{pendingSkillFile?.name}</span>
                  ，请输入这个 Skill 的原主人姓名。
                </p>
              </div>
              <button
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                onClick={closeDroppedSkillPrompt}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="flex flex-col gap-3" onSubmit={handleDroppedSkillSubmit}>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                onChange={(event) => setPendingSkillOwner(event.target.value)}
                placeholder="例如：张三 / Alice / Dana"
                ref={droppedSkillOwnerInputRef}
                type="text"
                value={pendingSkillOwner}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={closeDroppedSkillPrompt}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-500 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction === "skill"}
                  type="submit"
                >
                  <Upload className="h-4 w-4" />
                  {busyAction === "skill" ? "上传中..." : "让 TA 进群"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex max-w-[86vw] flex-col border-r border-white/80 bg-white/88 backdrop-blur-xl transition-all duration-200 md:static md:z-0 md:max-w-none md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "w-[84px] md:w-[84px]" : "w-[292px] md:w-[292px]",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b border-slate-100/90",
            sidebarCollapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <button
            className="text-slate-500 transition-colors hover:text-slate-700"
            onClick={toggleSidebarFromSidebarButton}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>

        {sidebarCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 px-2 py-4">
            <button
              className="flex w-full flex-col items-center gap-2 rounded-[20px] px-2 py-2 text-center transition-colors hover:bg-white"
              onClick={openSidebarFromChat}
              type="button"
            >
              {renderAvatar("SkillBar", "size-11 text-sm")}
              <span className="text-[11px] font-medium text-slate-600">群聊</span>
            </button>

            <div className="flex size-11 items-center justify-center rounded-[18px] bg-slate-100 text-[11px] font-medium text-slate-600">
              {snapshot.participants.length}
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <a
                className="flex size-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                href={GITHUB_LINK}
                rel="noreferrer"
                target="_blank"
              >
                <GitHubIcon className="size-4.5" />
                <span className="sr-only">GitHub</span>
              </a>
              <a
                className="flex size-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                href={XIAOHONGSHU_LINK}
                rel="noreferrer"
                target="_blank"
              >
                <XiaohongshuIcon className="size-4.5" />
                <span className="sr-only">小红书</span>
              </a>
              {viewer.authenticated ? (
                <button
                  className="flex size-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white transition-colors hover:border-slate-300"
                  onClick={openSidebarFromChat}
                  type="button"
                >
                  {renderAvatar(viewer.name ?? viewer.email ?? "User", "size-9")}
                </button>
              ) : (
                <button
                  className="flex size-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                  onClick={openAuthDialog}
                  type="button"
                >
                  <KeyRound className="size-4.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-slate-100/90 p-3">
              <button
                className="flex w-full items-center gap-3 rounded-[22px] border border-blue-100 bg-[linear-gradient(180deg,#4da2ef,#3390ec)] px-3 py-3 text-white shadow-[0_18px_34px_rgba(51,144,236,0.18)] transition-transform hover:-translate-y-0.5"
                onClick={() => setSidebarOpen(false)}
                type="button"
              >
                {renderAvatar("SkillBar", "size-11 text-sm")}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate text-sm font-semibold text-white">SkillBar 群聊</h3>
                    <span className="shrink-0 text-[11px] text-blue-100">
                      {latestMessage ? formatSidebarTime(latestMessage.createdAt) : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-blue-100">{getSidebarPreview(snapshot)}</p>
                    {thinkingCount > 0 ? (
                      <span className="min-w-[1.4rem] rounded-full bg-white/90 px-1.5 py-0.5 text-center text-[11px] font-medium text-blue-500">
                        {thinkingCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
              <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-slate-500">
                <Paperclip className="size-3.5" />
                拖入或点击输入框左侧附件，立刻上传新的 Skill。
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
                    Members
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {snapshot.participants.length} 位成员，{thinkingCount} 位正在思考
                  </p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-[18px] bg-slate-100 text-slate-500">
                  <UsersRound className="size-4.5" />
                </div>
              </div>

              <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/88">
                {snapshot.participants.map((participant, index) => (
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-3",
                      index !== 0 ? "border-t border-slate-100/90" : "",
                    )}
                    key={participant.id}
                  >
                    {renderAvatar(participant.name, "size-10")}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {participant.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {getStatusLabel(participant, viewer.participantId, runtimeReady)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100/90 px-3 py-3">
              <p className="mb-2 text-xs text-slate-500">欢迎 star 与讨论</p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
                  href={GITHUB_LINK}
                  rel="noreferrer"
                  target="_blank"
                >
                  <GitHubIcon className="size-4.5" />
                  GitHub
                </a>
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
                  href={XIAOHONGSHU_LINK}
                  rel="noreferrer"
                  target="_blank"
                >
                  <XiaohongshuIcon className="size-4.5" />
                  小红书
                </a>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-slate-200/80 bg-white/90 px-3 py-3">
                {viewer.authenticated ? (
                  renderAvatar(viewer.name ?? viewer.email ?? "User", "size-10")
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <KeyRound className="size-4.5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {viewer.authenticated ? viewer.name ?? viewer.email : "未登录游客"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {viewer.authenticated ? authStatusText : "点输入框即可登录并参与发言"}
                  </p>
                </div>
                {viewer.authenticated ? (
                  <LogoutButton className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" />
                ) : (
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={openAuthDialog}
                    type="button"
                  >
                    登录
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#e4ebf5]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />

        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-blue-500/10 backdrop-blur-[2px]">
            <div className="rounded-[24px] border-2 border-dashed border-blue-400 bg-white/92 px-8 py-6 text-center shadow-xl">
              <p className="text-lg font-semibold text-slate-900">把 SKILL.md 拖进来</p>
              <p className="mt-2 text-sm text-slate-500">
                松开后我会继续询问这个 Skill 原主人的姓名。
              </p>
            </div>
          </div>
        ) : null}

        <div className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/80 bg-white/82 px-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              className="text-slate-500 transition-colors hover:text-slate-700 md:hidden"
              onClick={openSidebarFromChat}
              type="button"
            >
              <Menu className="size-5" />
            </button>
            {renderAvatar("SkillBar", "size-10")}
            <div>
              <h2 className="leading-tight font-medium text-slate-900">SkillBar 群聊</h2>
              <p className="text-xs text-slate-500">
                {snapshot.participants.length} members
                {thinkingCount > 0 ? `, ${thinkingCount} thinking` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <button
              className="inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white hover:text-slate-700"
              onClick={openHistorySearch}
              type="button"
            >
              <Search className="size-4.5" />
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              onClick={() => {
                setActiveGuideStep(0);
                setIsGuideContentVisible(true);
                setIsGuideDialogOpen(true);
              }}
              type="button"
            >
              Guide
            </button>
          </div>
        </div>

        {isHistorySearchOpen ? (
          <div className="z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-full bg-slate-100 py-2 pr-4 pl-9 text-sm text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-400"
                  onChange={(event) => setHistorySearchQuery(event.target.value)}
                  placeholder="搜索历史聊天记录"
                  ref={historySearchInputRef}
                  type="text"
                  value={historySearchQuery}
                />
              </div>
              <div className="hidden text-xs text-slate-500 sm:block">
                {historySearchQuery.trim()
                  ? `${visibleMessages.length} 条结果`
                  : "可搜索发送者和消息内容"}
              </div>
              <button
                className="rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={closeHistorySearch}
                type="button"
              >
                关闭
              </button>
            </div>
          </div>
        ) : null}

        <div className="z-10 flex flex-1 flex-col gap-2 overflow-y-auto p-4" ref={messagesContainerRef}>
          <div className="my-2 flex justify-center">
            <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {historySearchQuery.trim() ? `找到 ${visibleMessages.length} 条相关记录` : "Today"}
            </span>
          </div>

          {visibleMessages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-md rounded-3xl bg-white/85 px-5 py-4 text-center text-sm leading-6 text-slate-600 shadow-sm">
                {historySearchQuery.trim()
                  ? "没有搜索到对应的历史聊天记录。"
                  : "把 SKILL.md 直接拖入群聊界面即可，拖入后会要求填写这个 Skill 的原主人姓名。"}
              </div>
            </div>
          ) : (
            visibleMessages.map((message, index) => {
              if (message.senderKind === "system") {
                return (
                  <div className="flex justify-center" key={message.id}>
                    <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {renderMessageText(message.content, historySearchQuery)}
                    </span>
                  </div>
                );
              }

              const isSelf =
                Boolean(viewer.participantId) && message.senderId === viewer.participantId;
              const previous = visibleMessages[index - 1];
              const next = visibleMessages[index + 1];
              const previousSender =
                previous && previous.senderKind !== "system" ? previous.senderId : null;
              const nextSender = next && next.senderKind !== "system" ? next.senderId : null;
              const showAvatar = !isSelf && nextSender !== message.senderId;
              const isFirstInGroup = previousSender !== message.senderId;

              return (
                <div
                  className={cn(
                    "flex max-w-[75%]",
                    isSelf ? "self-end" : "self-start",
                    isFirstInGroup ? "mt-1" : "",
                  )}
                  key={message.id}
                >
                  {!isSelf && showAvatar ? (
                    <div className="mr-2 mb-1 self-end">
                      {renderAvatar(message.senderName, "size-9")}
                    </div>
                  ) : null}
                  {!isSelf && !showAvatar ? <div className="w-11" /> : null}

                  <div
                    className={cn(
                      "relative flex flex-col rounded-[20px] px-3 py-2 shadow-sm",
                      isSelf
                        ? "rounded-br-sm bg-[#e8f3fe] text-slate-900"
                        : "rounded-bl-sm bg-white/96 text-slate-900",
                    )}
                  >
                    {!isSelf && isFirstInGroup ? (
                      <span className={cn("mb-0.5 text-sm font-medium", getNameTone(message.senderName))}>
                        {renderSenderName(message.senderName, historySearchQuery)}
                      </span>
                    ) : null}
                    <div className="flex items-end gap-2">
                      <span className="whitespace-pre-wrap break-words text-[15px] leading-snug">
                        {renderMessageText(message.content, historySearchQuery)}
                      </span>
                      <div className="mb-0.5 flex shrink-0 items-center gap-1 opacity-60">
                        <span className="text-[11px]">{formatTime(message.createdAt)}</span>
                        {isSelf ? <CheckCheck className="h-3.5 w-3.5 text-blue-500" /> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showScrollToBottomButton ? (
          <button
            className="absolute right-4 bottom-24 z-20 inline-flex size-11 items-center justify-center rounded-full border border-blue-200 bg-white/94 text-blue-500 shadow-[0_18px_40px_rgba(51,144,236,0.16)] backdrop-blur transition-colors hover:border-blue-300 hover:text-blue-600"
            onClick={() => scrollMessagesToBottom()}
            type="button"
          >
            <ArrowDown className="size-5" />
            <span className="sr-only">回到底部</span>
          </button>
        ) : null}

        <div className="z-10 shrink-0 border-t border-white/80 bg-white/84 p-3 backdrop-blur-xl">
          {chatError ? (
            <div className="mx-auto mb-2 max-w-4xl rounded-[20px] border border-rose-100 bg-rose-50/90 px-3 py-2 text-sm text-rose-600">
              {chatError}
            </div>
          ) : null}

          <form className="mx-auto flex max-w-4xl items-end gap-2" onSubmit={handleMessageSubmit}>
            <button
              className="mb-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              onClick={openSkillFilePicker}
              type="button"
            >
              <Paperclip className="size-5" />
            </button>
            <div className="flex flex-1 items-center rounded-[22px] border border-slate-200 bg-white/95 px-3 shadow-sm transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
              {viewer.authenticated ? (
                <textarea
                  className="max-h-32 min-h-[46px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-relaxed text-slate-900 focus:outline-none"
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={handleMessageKeyDown}
                  placeholder={composerPlaceholder}
                  rows={1}
                  value={composer}
                />
              ) : (
                <button
                  className="flex min-h-[46px] w-full items-center justify-between gap-3 py-3 text-left"
                  onClick={openComposerAuthDialog}
                  type="button"
                >
                  <span className="text-[15px] text-slate-400">
                    登录后参与发言，也可以先围观他们的聊天
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <KeyRound className="size-3.5" />
                    登录
                  </span>
                </button>
              )}
            </div>
            <button
              className="mb-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              disabled={
                viewer.authenticated
                  ? busyAction === "message" || !viewer.canSendMessage || !composer.trim()
                  : false
              }
              onClick={!viewer.authenticated ? openComposerAuthDialog : undefined}
              type={viewer.authenticated ? "submit" : "button"}
            >
              <SendHorizontal className="size-5" />
            </button>
          </form>

          {viewer.authenticated && !viewer.canSendMessage ? (
            <p className="mx-auto mt-2 max-w-4xl px-2 text-xs text-amber-600">
              当前频率限制为每 {formatIntervalText(viewer.messageIntervalMs)} 一条消息，还需等待{" "}
              {formatSeconds(viewer.remainingCooldownMs)} 秒。
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
