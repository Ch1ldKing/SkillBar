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
  ArrowDown,
  CheckCheck,
  KeyRound,
  Menu,
  MoreVertical,
  Paperclip,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Search,
  SendHorizontal,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  SkillBarMessage,
  SkillBarParticipant,
  SkillBarSnapshot,
} from "@/lib/skillbar-types";

type SkillBarAppProps = {
  initialSnapshot: SkillBarSnapshot;
};

type AnthropicFormState = {
  apiKey: string;
  authToken: string;
  baseUrl: string;
};

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const SCROLL_BOTTOM_THRESHOLD = 72;

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
  credentialsConfigured: boolean,
  schedulerPaused: boolean,
) {
  if (participant.kind === "human") {
    return "You";
  }

  if (!credentialsConfigured) {
    return "Waiting for credentials";
  }

  if (participant.needsGreeting && !participant.hasSession) {
    return "Joining";
  }

  if (schedulerPaused && participant.status === "idle") {
    return "Paused";
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
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "请求失败。");
  }

  return data;
}

export function SkillBarApp({ initialSnapshot }: SkillBarAppProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [composer, setComposer] = useState("");
  const [anthropicForm, setAnthropicForm] = useState<AnthropicFormState>({
    apiKey: "",
    authToken: "",
    baseUrl: "",
  });
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "anthropic" | "skill" | "message" | "control" | null
  >(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [pendingSkillFile, setPendingSkillFile] = useState<File | null>(null);
  const [pendingSkillOwner, setPendingSkillOwner] = useState("");
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const droppedSkillOwnerInputRef = useRef<HTMLInputElement | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasInitializedMessageScrollRef = useRef(false);

  const agents = useMemo(
    () => snapshot.participants.filter((participant) => participant.kind === "agent"),
    [snapshot.participants],
  );
  const credentialsConfigured = snapshot.anthropic.credentialsConfigured;
  const schedulerPaused = snapshot.scheduler.paused;
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

    return deferredMessages.filter((message) => messageMatchesQuery(message, historySearchQuery));
  }, [deferredMessages, historySearchQuery]);
  const isDragActive = dragDepth > 0;
  const isDroppedSkillPromptOpen = Boolean(pendingSkillFile);

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
    }, 2000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!noticeMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNoticeMessage(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [noticeMessage]);

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

  function handleAnthropicInputChange(field: keyof AnthropicFormState, value: string) {
    setAnthropicForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function showComingSoon(message = "敬请期待") {
    setNoticeMessage(message);
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

  async function handleAnthropicSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSidebarError(null);
    setBusyAction("anthropic");

    try {
      const next = await postJson<SkillBarSnapshot>("/api/settings/token", {
        apiKey: anthropicForm.apiKey,
        authToken: anthropicForm.authToken,
        baseUrl: anthropicForm.baseUrl,
      });

      startTransition(() => {
        setSnapshot(next);
      });

      setAnthropicForm({
        apiKey: "",
        authToken: "",
        baseUrl: "",
      });
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : "保存 Anthropic 配置失败。");
    } finally {
      setBusyAction(null);
    }
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
        method: "POST",
        body: formData,
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
      setChatError(error instanceof Error ? error.message : "发送消息失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function runControlAction(action: "pause" | "resume" | "reset") {
    setSidebarError(null);
    setChatError(null);
    setBusyAction("control");

    try {
      const next = await postJson<SkillBarSnapshot>("/api/control", {
        action,
      });

      startTransition(() => {
        setSnapshot(next);
      });

      if (action === "reset") {
        setComposer("");
        setHistorySearchQuery("");
        setIsHistorySearchOpen(false);
        setPendingSkillFile(null);
        setPendingSkillOwner("");
        setDragDepth(0);
        setNoticeMessage("已清空成员和聊天记录");
        return;
      }

      setNoticeMessage(action === "pause" ? "已暂停 Agent 输出" : "已恢复 Agent 输出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "执行控制操作失败。";
      setSidebarError(message);
      setChatError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePauseToggle() {
    await runControlAction(schedulerPaused ? "resume" : "pause");
  }

  async function handleReset() {
    const confirmed = window.confirm("这会清空所有 Agent 和全部聊天记录，确定继续吗？");

    if (!confirmed) {
      return;
    }

    await runControlAction("reset");
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

      {noticeMessage ? (
        <div className="pointer-events-none fixed top-4 right-4 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {noticeMessage}
        </div>
      ) : null}

      {isDroppedSkillPromptOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
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
          "fixed inset-y-0 left-0 z-30 flex max-w-[86vw] flex-col border-r border-slate-200 bg-white transition-all duration-200 md:static md:z-0 md:max-w-none md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "w-80 md:w-20" : "w-80 md:w-80",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b border-slate-100",
            sidebarCollapsed ? "justify-center px-0" : "justify-between px-4",
          )}
        >
          <button
            className="text-slate-500 transition-colors hover:text-slate-700"
            onClick={toggleSidebarFromSidebarButton}
            type="button"
          >
            <Menu className="h-6 w-6" />
          </button>
          {!sidebarCollapsed ? (
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">SkillBar</p>
              <p className="text-xs text-slate-500">Settings stay in sidebar</p>
            </div>
          ) : null}
        </div>

        {sidebarCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-4 py-4">
            <button
              className="flex w-full flex-col items-center gap-2 px-2 text-center"
              onClick={openSidebarFromChat}
              type="button"
            >
              {renderAvatar("SkillBar", "h-12 w-12 text-sm")}
              <span className="text-[11px] font-medium text-slate-600">群聊</span>
            </button>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
              onClick={openSidebarFromChat}
              type="button"
            >
              <KeyRound className="h-5 w-5" />
            </button>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-center text-[11px] font-medium text-slate-600">
              {snapshot.participants.length} 人
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <button
              className="flex w-full cursor-pointer items-center gap-3 bg-blue-500 px-3 py-2.5 text-white transition-colors"
              onClick={() => setSidebarOpen(false)}
              type="button"
            >
              {renderAvatar("SkillBar", "h-12 w-12 text-sm")}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline justify-between">
                  <h3 className="truncate font-medium text-white">SkillBar 群聊</h3>
                  <span className="shrink-0 text-xs text-blue-100">
                    {latestMessage ? formatSidebarTime(latestMessage.createdAt) : ""}
                  </span>
                </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-blue-100">{getSidebarPreview(snapshot)}</p>
                    {schedulerPaused ? (
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-amber-600">
                        已暂停
                      </span>
                    ) : thinkingCount > 0 ? (
                      <span className="min-w-[1.25rem] shrink-0 rounded-full bg-white px-1.5 py-0.5 text-center text-xs font-medium text-blue-500">
                        {thinkingCount}
                      </span>
                    ) : null}
                  </div>
                </div>
            </button>

            <div className="border-t border-slate-100 p-3">
              <div className="flex flex-col gap-3">
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Anthropic</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        credentialsConfigured
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {credentialsConfigured ? "Ready" : "Not set"}
                    </span>
                  </div>
                  <p className="mb-2 text-xs leading-5 text-slate-500">
                    `ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 至少填一个，`ANTHROPIC_BASE_URL`
                    可选。
                  </p>
                  <form className="flex flex-col gap-2" onSubmit={handleAnthropicSubmit}>
                    <input
                      autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      onChange={(event) => handleAnthropicInputChange("apiKey", event.target.value)}
                      placeholder="ANTHROPIC_API_KEY"
                      type="password"
                      value={anthropicForm.apiKey}
                    />
                    <input
                      autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      onChange={(event) =>
                        handleAnthropicInputChange("authToken", event.target.value)
                      }
                      placeholder="ANTHROPIC_AUTH_TOKEN"
                      type="password"
                      value={anthropicForm.authToken}
                    />
                    <input
                      autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      onChange={(event) => handleAnthropicInputChange("baseUrl", event.target.value)}
                      placeholder="ANTHROPIC_BASE_URL (optional)"
                      type="url"
                      value={anthropicForm.baseUrl}
                    />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busyAction === "anthropic"}
                      type="submit"
                    >
                      <KeyRound className="h-4 w-4" />
                      {busyAction === "anthropic" ? "Saving..." : "Save config"}
                    </button>
                  </form>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                    <div className="rounded-2xl bg-white px-2.5 py-2">
                      <div className="font-medium text-slate-700">API Key</div>
                      <div>{snapshot.anthropic.apiKeyConfigured ? "Saved" : "Empty"}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-2.5 py-2">
                      <div className="font-medium text-slate-700">Auth Token</div>
                      <div>{snapshot.anthropic.authTokenConfigured ? "Saved" : "Empty"}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-2.5 py-2">
                      <div className="font-medium text-slate-700">Base URL</div>
                      <div>{snapshot.anthropic.baseUrlConfigured ? "Saved" : "Default"}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">Skill Upload</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      把 SKILL.md 拖入群聊界面即可。拖进去之后，会再询问这个 Skill 的原主人姓名。
                    </p>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Agent 调度</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        暂停会停止 Agent 继续输出，重置会清空所有 Agent 和聊天记录。
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        schedulerPaused
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700",
                      )}
                    >
                      {schedulerPaused ? "Paused" : "Running"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        schedulerPaused
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-amber-500 text-white hover:bg-amber-600",
                      )}
                      disabled={busyAction === "control"}
                      onClick={() => void handlePauseToggle()}
                      type="button"
                    >
                      {schedulerPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      {busyAction === "control"
                        ? "处理中..."
                        : schedulerPaused
                          ? "继续输出"
                          : "暂停输出"}
                    </button>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-rose-500 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busyAction === "control"}
                      onClick={() => void handleReset()}
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {busyAction === "control" ? "处理中..." : "重置群聊"}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">Members</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {snapshot.participants.length} members, {thinkingCount} thinking now.
                    </p>
                  </div>
                  <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                    {snapshot.participants.map((participant) => (
                      <div
                        className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2"
                        key={participant.id}
                      >
                        {renderAvatar(participant.name, "h-10 w-10")}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {participant.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {getStatusLabel(participant, credentialsConfigured, schedulerPaused)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {sidebarError ? (
                  <div className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
                    {sidebarError}
                  </div>
                ) : null}
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
            <div className="rounded-[32px] border-2 border-dashed border-blue-400 bg-white/90 px-8 py-6 text-center shadow-xl">
              <p className="text-lg font-semibold text-slate-900">把 SKILL.md 拖到这里</p>
              <p className="mt-2 text-sm text-slate-500">
                松开后我会询问这个 Skill 原主人的姓名。
              </p>
            </div>
          </div>
        ) : null}

        <div className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className="text-slate-500 transition-colors hover:text-slate-700 md:hidden"
              onClick={openSidebarFromChat}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            {renderAvatar("SkillBar", "h-10 w-10")}
            <div>
              <h2 className="leading-tight font-medium text-slate-900">SkillBar 群聊</h2>
              <p className="text-xs text-slate-500">
                {snapshot.participants.length} members
                {thinkingCount > 0 ? `, ${thinkingCount} thinking` : ""}
                {schedulerPaused ? ", agents paused" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-500">
            <button
              className="transition-colors hover:text-slate-700"
              onClick={openHistorySearch}
              type="button"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              className="transition-colors hover:text-slate-700"
              onClick={() => showComingSoon("敬请期待")}
              type="button"
            >
              <Phone className="h-5 w-5" />
            </button>
            <button
              className="transition-colors hover:text-slate-700"
              onClick={() => showComingSoon("敬请期待")}
              type="button"
            >
              <MoreVertical className="h-5 w-5" />
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

        {schedulerPaused ? (
          <div className="z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Agent 输出已暂停，你仍然可以继续发消息；恢复后，新的调度会继续运行
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

              const isSelf = message.senderKind === "human";
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
                    <div className="mr-2 mb-1 self-end">{renderAvatar(message.senderName, "h-9 w-9")}</div>
                  ) : null}
                  {!isSelf && !showAvatar ? <div className="w-11" /> : null}

                  <div
                    className={cn(
                      "relative flex flex-col rounded-2xl px-3 py-1.5 shadow-sm",
                      isSelf
                        ? "rounded-br-sm bg-[#e3f2fd] text-slate-900"
                        : "rounded-bl-sm bg-white text-slate-900",
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

        <div className="z-10 shrink-0 bg-white p-3">
          {chatError ? (
            <div className="mx-auto mb-2 max-w-4xl rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
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
            <div className="flex flex-1 items-end rounded-[22px] border border-slate-200 bg-white px-3 shadow-sm transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
              <textarea
                className="max-h-32 min-h-[46px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-relaxed focus:outline-none"
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Write a message..."
                rows={1}
                value={composer}
              />
            </div>
            <button
              className="mb-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              disabled={busyAction === "message" || !composer.trim()}
              type="submit"
            >
              <SendHorizontal className="size-5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
