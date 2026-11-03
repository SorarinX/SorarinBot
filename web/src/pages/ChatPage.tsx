import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChatIcon,
  CopyIcon,
  RefreshIcon,
  SearchIcon,
} from "../components/icons";
import { ChatSessionSkeleton } from "../components/Skeletons";
import { cn } from "../lib/cn";
import {
  chatDayKey,
  copyText,
  formatChatDay,
  formatChatTime,
  sessionMatchesRow,
  sortChatRowsChronologically,
  type ChatRow,
} from "../lib/chat";
import {
  formatInteger,
  sessionInitial,
  sessionKindLabel,
  sessionLabel,
} from "../lib/dashboard";
import { useChatData } from "../lib/useChatData";
import "../styles/chat.css";

type SessionFilter = "all" | "private" | "group";

const FILTERS: Array<{ value: SessionFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "private", label: "私聊" },
  { value: "group", label: "群聊" },
];

type ThreadItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "row"; key: string; row: ChatRow };

export default function ChatPage() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [copiedRoom, setCopiedRoom] = useState(false);

  const {
    mode,
    loading,
    sessions,
    rows,
    total,
    newIds,
    refresh,
    refreshing,
    loadMore,
    loadingMore,
  } = useChatData(selectedKey);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollOnNextRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const copyTimerRef = useRef<number | null>(null);

  const selected = useMemo(
    () => sessions.find((session) => session.key === selectedKey) ?? null,
    [sessions, selectedKey],
  );

  useEffect(() => {
    if (selectedKey && !sessions.some((session) => session.key === selectedKey)) {
      setSelectedKey(null);
      setMobileView("list");
      scrollOnNextRef.current = false;
    }
  }, [sessions, selectedKey]);

  useEffect(() => {
    setCopiedRoom(false);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [selectedKey]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (filter === "private" && session.kind !== "private") return false;
      if (filter === "group" && session.kind !== "group") return false;
      if (!normalized) return true;
      return sessionLabel(session).toLowerCase().includes(normalized);
    });
  }, [sessions, query, filter]);

  const threadRows = useMemo(() => {
    if (!selected) return [];
    return sortChatRowsChronologically(
      rows.filter((row) => sessionMatchesRow(selected, row)),
    );
  }, [rows, selected]);

  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [];
    let previousDay = "";

    for (const row of threadRows) {
      const day = chatDayKey(row.createdAt);
      if (day !== previousDay) {
        items.push({
          kind: "date",
          key: `date-${day}-${row.id}`,
          label: formatChatDay(row.createdAt),
        });
        previousDay = day;
      }
      items.push({ kind: "row", key: `row-${row.id}`, row });
    }

    return items;
  }, [threadRows]);

  useEffect(() => {
    if (!selected) return;
    const element = scrollRef.current;
    if (!element) return;

    if (scrollOnNextRef.current) {
      element.scrollTop = element.scrollHeight;
      scrollOnNextRef.current = false;
      wasAtBottomRef.current = true;
      return;
    }

    if (wasAtBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [selected, selectedKey, threadRows.length, mobileView]);

  function selectSession(key: string) {
    setSelectedKey(key);
    setMobileView("thread");
    setCopiedRoom(false);
    scrollOnNextRef.current = true;
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }

  function showSessionList() {
    setMobileView("list");
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    wasAtBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  async function handleCopyRoom() {
    if (!selected?.room) return;
    const copied = await copyText(selected.room);
    if (!copied) return;

    setCopiedRoom(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedRoom(false);
    }, 1_400);
  }

  async function handleLoadMore() {
    const element = scrollRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;

    wasAtBottomRef.current = false;
    await loadMore();

    window.requestAnimationFrame(() => {
      const next = scrollRef.current;
      if (!next) return;
      next.scrollTop = previousTop + (next.scrollHeight - previousHeight);
      wasAtBottomRef.current =
        next.scrollHeight - next.scrollTop - next.clientHeight < 48;
    });
  }

  return (
    <div
      className={cn(
        "chat-page",
        selected && mobileView === "thread" && "is-thread-view",
      )}
    >
      <header className="chat-page-head">
        <div className="chat-kicker-row">
          <p className="chat-kicker">SESSIONS</p>
          {mode === "demo" ? (
            <span className="chat-demo-chip">演示数据</span>
          ) : null}
          {mode === "connecting" ? (
            <span className="chat-demo-chip">正在连接</span>
          ) : null}
        </div>
        <h1 className="chat-title">会话</h1>
        <p className="chat-subtitle">按会话查看聊天记录与上下文</p>
      </header>

      <div
        className={cn(
          "chat-layout",
          selected && mobileView === "thread" && "is-thread",
        )}
      >
        <aside className="chat-list-panel" aria-label="会话列表">
          <div className="chat-list-tools">
            <label className="chat-search">
              <SearchIcon className="chat-search-icon size-3.5" />
              <input
                type="text"
                className="chat-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索会话"
                aria-label="搜索会话"
              />
            </label>

            <div className="chat-filters" role="group" aria-label="会话类型">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="chat-filter"
                  data-active={filter === item.value}
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="chat-session-list">
            {loading && sessions.length === 0 ? (
              <ChatSessionSkeleton />
            ) : loading ? (
              <p className="chat-list-empty">正在加载会话…</p>
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((session) => (
                <button
                  key={session.key}
                  type="button"
                  className="chat-session"
                  data-active={selectedKey === session.key}
                  data-session-key={session.key}
                  aria-current={
                    selectedKey === session.key ? "true" : undefined
                  }
                  onClick={() => selectSession(session.key)}
                >
                  <span
                    className={cn(
                      "chat-avatar",
                      session.kind === "group" && "chat-avatar--group",
                    )}
                    aria-hidden="true"
                  >
                    {sessionInitial(session)}
                  </span>
                  <span className="chat-session-body">
                    <span className="chat-session-top">
                      <span
                        className="chat-session-name"
                        title={sessionLabel(session)}
                      >
                        {sessionLabel(session)}
                      </span>
                      <span className="chat-pill">
                        {sessionKindLabel(session.kind)}
                      </span>
                    </span>
                    <span className="chat-session-rounds">
                      {session.pairs} 轮
                    </span>
                  </span>
                  <span
                    className="chat-session-time"
                    title={
                      session.relative
                        ? undefined
                        : "会话接口暂未提供最近活动时间"
                    }
                  >
                    {session.relative ?? "—"}
                  </span>
                </button>
              ))
            ) : (
              <p className="chat-list-empty">
                {sessions.length === 0 ? "还没有会话" : "没有匹配的会话"}
              </p>
            )}
          </div>
        </aside>

        <section className="chat-main-panel" aria-label="消息">
          {selected ? (
            <>
              <header className="chat-main-head">
                <button
                  type="button"
                  className="chat-back"
                  onClick={showSessionList}
                  aria-label="返回会话列表"
                  title="返回会话列表"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>

                <div className="chat-main-title">
                  <h2 title={sessionLabel(selected)}>
                    {sessionLabel(selected)}
                  </h2>
                  <span className="chat-pill">
                    {sessionKindLabel(selected.kind)}
                  </span>
                </div>

                {selected.room ? (
                  <div className="chat-room">
                    <span className="chat-room-text" title={selected.room}>
                      {selected.room}
                    </span>
                    <button
                      type="button"
                      className="chat-icon-button"
                      onClick={() => void handleCopyRoom()}
                      aria-label={
                        copiedRoom ? "已复制房间号" : "复制房间号"
                      }
                      title={
                        copiedRoom
                          ? "已复制"
                          : `复制房间号：${selected.room}`
                      }
                    >
                      {copiedRoom ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="chat-refresh"
                  onClick={refresh}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  aria-label="刷新会话"
                  title="刷新会话"
                >
                  <RefreshIcon
                    className={cn("size-3.5", refreshing && "chat-spinning")}
                  />
                  <span className="chat-refresh-label">刷新</span>
                </button>
              </header>

              <div className="chat-thread" key={selected.key}>
                {threadRows.length > 0 ? (
                  <div
                    className="chat-messages"
                    ref={scrollRef}
                    onScroll={handleScroll}
                  >
                    {threadItems.map((item) =>
                      item.kind === "date" ? (
                        <div className="chat-date" key={item.key}>
                          <span>{item.label}</span>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "chat-exchange",
                            newIds.has(item.row.id) && "chat-exchange--new",
                          )}
                          key={item.key}
                        >
                          {item.row.userMessage ? (
                            <div className="chat-bubble chat-bubble--user">
                              <p>{item.row.userMessage}</p>
                            </div>
                          ) : null}

                          {item.row.botReply ? (
                            <div className="chat-bot">
                              <div className="chat-bubble chat-bubble--bot">
                                <p>{item.row.botReply}</p>
                              </div>
                              <p
                                className="chat-bot-meta"
                                title={`${
                                  formatChatTime(item.row.createdAt) || "--:--"
                                } · ${item.row.model || "未知模型"} · ${formatInteger(
                                  item.row.totalTokens,
                                )} tokens`}
                              >
                                <span>
                                  {formatChatTime(item.row.createdAt) || "--:--"}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span>{item.row.model || "未知模型"}</span>
                                <span aria-hidden="true"> · </span>
                                <span>
                                  {formatInteger(item.row.totalTokens)} tokens
                                </span>
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="chat-thread-empty">
                    <span className="chat-empty-icon">
                      <ChatIcon className="size-5" />
                    </span>
                    <p>{loading ? "正在加载消息…" : "还没有消息"}</p>
                  </div>
                )}
              </div>

              {total > rows.length ? (
                <footer className="chat-more">
                  <button
                    type="button"
                    className="chat-more-button"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                  >
                    {loadingMore ? "加载中…" : "加载更多"}
                  </button>
                </footer>
              ) : null}
            </>
          ) : (
            <div className="chat-empty-main">
              <span className="chat-empty-icon">
                <ChatIcon className="size-5" />
              </span>
              <p>左侧选择一个会话</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
