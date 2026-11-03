import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { saveConfig } from "../lib/settings";
import { useConfigData } from "../lib/useConfigData";
import "../styles/admin-page.css";
import "../styles/settings.css";

const DEMO_PROMPT = [
  "你叫 SorarinBot，是一个运行在本地微信里的 AI 助手。",
  "",
  "回答原则：",
  "1. 用简洁、自然的中文回复，先给结论，再补充细节。",
  "2. 在群聊中保持克制，不主动打断成员之间的对话。",
  "3. 不确定的信息要明确说明，不要编造事实。",
  "4. 不转发、不复述隐私、账号或密钥内容。",
  "5. 需要较长的回答时，用短段落和列表组织。",
  "",
  "边界：",
  "- 不代替用户做出法律、医疗或财务决定。",
  "- 不主动添加用户没有提到的事实。",
  "- 如果请求不清晰，先问一个澄清问题。",
].join("\n");

type SaveState = { tone: "success" | "error"; text: string };

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "本地服务不可用";
}

export default function PromptPage() {
  const { config, status } = useConfigData();
  const location = useLocation();
  const isDemo = new URLSearchParams(location.search).get("demo") === "1";
  const available = status === "live" && config !== null;
  const unavailable = status === "unavailable";

  const [promptText, setPromptText] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (status === "live" && config) {
      setPromptText(config.prompt);
      setSavedPrompt(config.prompt);
      setSaveState(null);
      return;
    }

    if (status === "unavailable") {
      setPromptText(DEMO_PROMPT);
      setSavedPrompt(DEMO_PROMPT);
    }
  }, [status, config]);

  const dirty = promptText !== savedPrompt;
  const canSave = available && dirty && !saving;
  const charCount = Array.from(promptText).length;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }, [promptText, status]);

  useEffect(() => {
    if (!dirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveState(null);

    try {
      await saveConfig({ prompt: promptText });
      setSavedPrompt(promptText);
      setSaveState({ tone: "success", text: "提示词已保存" });
    } catch (error) {
      setSaveState({
        tone: "error",
        text: "保存失败：" + errorText(error),
      });
    } finally {
      setSaving(false);
    }
  }

  const statusText = saveState
    ? saveState.text
    : unavailable
      ? "示例内容，保存不可用"
      : dirty
        ? "有未保存的修改"
        : "已保存";

  return (
    <div className="prompt-page">
      <header className="admin-head-row">
        <div className="admin-head-copy">
          <div className="admin-kicker-row">
            <p className="admin-kicker">PROMPT</p>
            {unavailable ? <span className="admin-chip">演示内容</span> : null}
          </div>
          <h1 className="admin-title">系统提示词</h1>
          <p className="admin-subtitle">定义 AI 的人格与行为</p>
        </div>
        {isDemo ? (
          <span className="admin-chip prompt-demo-chip">演示数据</span>
        ) : null}
      </header>

      {unavailable ? (
        <div className="admin-notice" role="status">
          本地服务未启动，当前展示示例提示词，保存不可用
        </div>
      ) : null}

      <section className="prompt-card admin-card" aria-label="系统提示词编辑器">
        <textarea
          ref={textareaRef}
          className="prompt-textarea"
          rows={12}
          value={promptText}
          onChange={(event) => {
            setPromptText(event.target.value);
            setSaveState(null);
          }}
          placeholder="输入系统提示词…"
          aria-label="系统提示词"
          disabled={status === "loading"}
          spellCheck={false}
        />

        <div className="prompt-meta">
          <span>支持多行文本与 Markdown</span>
          <span className="prompt-count">{charCount} 字</span>
        </div>

        <div className="prompt-actions">
          <span
            className="prompt-save-state"
            data-tone={saveState?.tone}
            role="status"
          >
            {statusText}
          </span>
          <button
            type="button"
            className="admin-button admin-button--primary"
            onClick={() => void handleSave()}
            disabled={!canSave}
            aria-busy={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </section>
    </div>
  );
}
