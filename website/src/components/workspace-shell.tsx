"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CheckCheck,
  KeyRound,
  Menu,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  Send,
  Smile,
  Upload,
  X,
} from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import type {
  SkillBarMessage,
  SkillBarParticipant,
  SkillBarSnapshot,
} from "@/lib/skillbar-types";

type WorkspaceShellProps = {
  currentUser: {
    email: string;
    image: string | null;
    name: string | null;
  };
  initialSnapshot: SkillBarSnapshot;
};

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

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

  if (!trimmed) {
    return "SB";
  }

  return trimmed
    .split("")
    .slice(0, 2)
    .join("")
    .toUpperCase();
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

function getStatusLabel(participant: SkillBarParticipant, runtimeReady: boolean) {
  if (participant.kind === "human") {
    return "You";
  }

  if (!runtimeReady) {
    return "Waiting for server";
  }

  if (participant.needsGreeting && !participant.hasThread) {
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

export function WorkspaceShell({ currentUser, initialSnapshot }: WorkspaceShellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [composer, setComposer] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"skill" | "message" | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [pendingSkillFile, setPendingSkillFile] = useState<File | null>(null);
  const [pendingSkillOwner, setPendingSkillOwner] = useState("");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const droppedSkillOwnerInputRef = useRef<HTMLInputElement | null>(null);

  const agents = useMemo(
    () => snapshot.participants.filter((participant) => participant.kind === "agent"),
    [snapshot.participants],
  );
  const runtimeReady = snapshot.workspace.runtime.ready;
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

  const poll = useEffectEvent(async () => {
    const response = await fetch("/api/workspace/state", {
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
    }, 2500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container || historySearchQuery.trim()) {
      return;
    }

    container.scrollTo({
      behavior: "smooth",
      top: container.scrollHeight,
    });
  }, [deferredMessages.length, historySearchQuery]);

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

  function showComingSoon(message = "敬请期待") {
    setNoticeMessage(message);
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

      const response = await fetch("/api/workspace/skills", {
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

    setChatError(null);
    setBusyAction("message");

    try {
      const next = await postJson<SkillBarSnapshot>("/api/workspace/messages", {
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

    setChatError(null);
    setPendingSkillFile(skillFile);
    setPendingSkillOwner("");
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

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-white font-sans text-slate-900"
      onDragEnter={handleMainDragEnter}
      onDragLeave={handleMainDragLeave}
      onDragOver={handleMainDragOver}
      onDrop={handleMainDrop}
    >
      <button
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed inset-0 z-20 bg-slate-900/20 backdrop-blur-[1px] md:hidden",
          sidebarOpen ? "block" : "hidden",
        )}
        onClick={() => setSidebarOpen(false)}
        type="button"
      />

      {isAccountMenuOpen ? (
        <button
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-transparent"
          onClick={() => setIsAccountMenuOpen(false)}
          type="button"
        />
      ) : null}

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
              <p className="max-w-44 truncate text-xs text-slate-500">
                {currentUser.name ?? currentUser.email}
              </p>
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
                  {thinkingCount > 0 ? (
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
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">Skill Upload</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      把 SKILL.md 拖入群聊界面即可。拖进去之后，会再询问这个 Skill 的原主人姓名。
                    </p>
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
                            {getStatusLabel(participant, runtimeReady)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
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

        <div className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className={cn(
                "text-slate-500 transition-colors hover:text-slate-700",
                sidebarCollapsed ? "md:inline-flex" : "md:hidden",
              )}
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
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-4 text-slate-500">
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
              onClick={() => setIsAccountMenuOpen((current) => !current)}
              type="button"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {isAccountMenuOpen ? (
              <div className="absolute top-10 right-0 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="rounded-xl px-3 py-2">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {currentUser.name ?? currentUser.email}
                  </p>
                  <p className="truncate text-xs text-slate-500">{currentUser.email}</p>
                </div>
                <div className="mt-1 border-t border-slate-100 pt-2">
                  <LogoutButton className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" />
                </div>
              </div>
            ) : null}
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
                    !isSelf && !showAvatar ? "ml-11" : "",
                    isFirstInGroup ? "mt-1" : "",
                  )}
                  key={message.id}
                >
                  {!isSelf && showAvatar ? (
                    <div className="mr-2 mb-1 self-end">
                      {renderAvatar(message.senderName, "h-9 w-9")}
                    </div>
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

        <div className="z-10 shrink-0 bg-white p-3">
          {chatError ? (
            <div className="mx-auto mb-2 max-w-4xl rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {chatError}
            </div>
          ) : null}

          <form className="mx-auto flex max-w-4xl items-end gap-2" onSubmit={handleMessageSubmit}>
            <button
              className="mb-1 shrink-0 p-2 text-slate-400 transition-colors hover:text-slate-600"
              onClick={() =>
                showComingSoon("敬请期待，当前请把 SKILL.md 直接拖入群聊界面。")
              }
              type="button"
            >
              <Paperclip className="h-6 w-6" />
            </button>
            <div className="flex flex-1 items-end rounded-2xl border border-slate-200 bg-white shadow-sm transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
              <button
                className="shrink-0 p-2.5 text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => showComingSoon("敬请期待")}
                type="button"
              >
                <Smile className="h-6 w-6" />
              </button>
              <textarea
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed focus:outline-none"
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Write a message..."
                rows={1}
                value={composer}
              />
            </div>
            {composer.trim() ? (
              <button
                className="mb-0.5 shrink-0 rounded-full bg-blue-500 p-3 text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busyAction === "message"}
                type="submit"
              >
                <Send className="ml-0.5 h-5 w-5" />
              </button>
            ) : (
              <button
                className="mb-0.5 shrink-0 p-3 text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => showComingSoon("敬请期待")}
                type="button"
              >
                <Mic className="h-6 w-6" />
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
