import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import {
  APP_VERSION,
  PROVIDER_PRESETS,
  getAutostart,
  getModels,
  inferPreset,
  maskApiKey,
  presetById,
  saveConfig,
  setAutostart as setAutostartApi,
  testConnection,
  type ConfigUpdate,
  type ProviderPresetId,
  type TestResult,
} from "../lib/settings";
import { useConfigData } from "../lib/useConfigData";
import "../styles/admin-page.css";
import "../styles/settings.css";

type Section = "provider" | "system";

type ProviderForm = {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

type InlineStatus = { tone: "success" | "error"; text: string };

const EMPTY_FORM: ProviderForm = {
  providerName: "",
  baseUrl: "",
  model: "",
  apiKey: "",
};

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "本地服务不可用";
}

export default function SettingsPage() {
  const { config, status } = useConfigData();
  const location = useLocation();
  const isDemo = new URLSearchParams(location.search).get("demo") === "1";
  const ready = status === "live" && config !== null;
  const unavailable = status === "unavailable";

  const [section, setSection] = useState<Section>("provider");
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [preset, setPreset] = useState<ProviderPresetId | "">("");
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<InlineStatus | null>(null);

  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState("");

  const [dataPath, setDataPath] = useState("");

  useEffect(() => {
    if (!config) return;
    setForm({
      providerName: config.provider.name,
      baseUrl: config.provider.baseUrl,
      model: config.provider.model,
      apiKey: "",
    });
    setPreset(inferPreset(config.provider.name));
    setMaskedKey(config.provider.apiKey);
    setDataPath(config.databasePath);
  }, [config]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setAutostartError("");

    getAutostart()
      .then((enabled) => {
        if (active) setAutostart(enabled);
      })
      .catch(() => {
        if (active) setAutostartError("读取开机自启状态失败");
      });

    return () => {
      active = false;
    };
  }, [ready]);

  function updateForm(patch: Partial<ProviderForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setSaveStatus(null);
    setTestResult(null);
  }

  function handlePresetChange(value: string) {
    if (!value) return;
    const nextPreset = value as ProviderPresetId;
    setPreset(nextPreset);
    setModels([]);
    setModelsError("");
    setTestResult(null);

    if (nextPreset === "custom") {
      setForm((current) => ({ ...current, providerName: "openaicompat" }));
      return;
    }

    const defaults = presetById(nextPreset);
    if (!defaults) return;

    setForm((current) => ({
      ...current,
      providerName: defaults.providerName,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    }));
  }

  async function handleLoadModels() {
    if (!ready || loadingModels) return;
    setLoadingModels(true);
    setModels([]);
    setModelsError("");

    try {
      const result = await getModels();
      if (result.ok && result.models.length > 0) {
        setModels(result.models);
      } else {
        setModelsError(result.error || "没有可用模型");
      }
    } catch (error) {
      setModelsError("获取模型失败：" + errorText(error));
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleTest() {
    if (!ready || testing) return;
    setTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        ok: false,
        latencyMs: null,
        model: "",
        error: "无法连接到本地服务：" + errorText(error),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!ready || saving) return;
    setSaving(true);
    setSaveStatus(null);

    const apiKey = form.apiKey.trim();
    const updates: ConfigUpdate = {
      provider_name: form.providerName,
      base_url: form.baseUrl.trim(),
      model: form.model.trim(),
    };
    if (apiKey) updates.api_key = apiKey;

    try {
      await saveConfig(updates);
      if (apiKey) setMaskedKey(maskApiKey(apiKey));
      setForm((current) => ({ ...current, apiKey: "" }));
      setSaveStatus({ tone: "success", text: "Provider 已保存" });
    } catch (error) {
      setSaveStatus({
        tone: "error",
        text: "保存失败：" + errorText(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAutostart() {
    if (!ready || autostartBusy) return;
    const next = !autostart;
    setAutostart(next);
    setAutostartBusy(true);
    setAutostartError("");

    try {
      const enabled = await setAutostartApi(next);
      setAutostart(enabled);
    } catch (error) {
      setAutostart(!next);
      setAutostartError("设置开机自启失败：" + errorText(error));
    } finally {
      setAutostartBusy(false);
    }
  }

  const formStateLabel =
    status === "loading"
      ? "正在读取配置…"
      : unavailable
        ? "配置不可用"
        : "本地服务已连接";

  return (
    <div className="settings-page">
      <header className="admin-head-row">
        <div className="admin-head-copy">
          <div className="admin-kicker-row">
            <p className="admin-kicker">SETTINGS</p>
          </div>
          <h1 className="admin-title">设置</h1>
          <p className="admin-subtitle">模型连接与运行配置</p>
        </div>

        <div className="settings-head-actions">
          {isDemo ? <span className="admin-chip">演示数据</span> : null}
          <Link
            to={isDemo ? "/settings/prompt?demo=1" : "/settings/prompt"}
            className="admin-link settings-prompt-link"
          >
            编辑系统提示词 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      {unavailable ? (
        <div className="admin-notice" role="status">
          本地服务未启动，配置不可用
        </div>
      ) : null}

      <div className="settings-layout">
        <nav className="settings-nav admin-card" aria-label="设置分区">
          <button
            type="button"
            data-active={section === "provider"}
            aria-current={section === "provider" ? "page" : undefined}
            onClick={() => setSection("provider")}
          >
            Provider
          </button>
          <button
            type="button"
            data-active={section === "system"}
            aria-current={section === "system" ? "page" : undefined}
            onClick={() => setSection("system")}
          >
            系统
          </button>
        </nav>

        <section
          className="settings-panel admin-card"
          aria-label={section === "provider" ? "Provider 配置" : "系统配置"}
        >
          {section === "provider" ? (
            <div className="settings-form">
              <header className="settings-form-head">
                <div>
                  <h2>Provider</h2>
                  <p>配置 LLM 服务商连接</p>
                </div>
                <span className="settings-form-state">{formStateLabel}</span>
              </header>

              <div className="settings-fields">
                <div className="settings-field">
                  <span className="admin-field-label">服务商</span>
                  <select
                    className="admin-select"
                    value={preset}
                    onChange={(event) => handlePresetChange(event.target.value)}
                    disabled={!ready}
                  >
                    <option value="">选择服务商</option>
                    {PROVIDER_PRESETS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <span className="admin-field-label">Base URL</span>
                  <input
                    className="admin-input"
                    type="url"
                    value={form.baseUrl}
                    onChange={(event) =>
                      updateForm({ baseUrl: event.target.value })
                    }
                    placeholder="https://api.deepseek.com"
                    disabled={!ready}
                  />
                </div>

                <div className="settings-field">
                  <span className="admin-field-label">Model</span>
                  <div className="settings-inline">
                    <input
                      className="admin-input"
                      type="text"
                      value={form.model}
                      onChange={(event) =>
                        updateForm({ model: event.target.value })
                      }
                      placeholder="deepseek-chat"
                      disabled={!ready}
                    />
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => void handleLoadModels()}
                      disabled={!ready || loadingModels}
                    >
                      {loadingModels ? "获取中…" : "获取模型"}
                    </button>
                  </div>

                  {models.length > 0 ? (
                    <select
                      className="admin-select settings-model-select"
                      value={models.includes(form.model) ? form.model : ""}
                      onChange={(event) => {
                        if (event.target.value) {
                          updateForm({ model: event.target.value });
                        }
                      }}
                      disabled={!ready}
                    >
                      <option value="">从列表选择模型</option>
                      {models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {modelsError ? (
                    <p className="admin-error-text">{modelsError}</p>
                  ) : null}
                </div>

                <div className="settings-field">
                  <span className="admin-field-label">API Key</span>
                  <div className="settings-key-row">
                    <input
                      className="admin-input"
                      type={showKey ? "text" : "password"}
                      value={form.apiKey}
                      onChange={(event) =>
                        updateForm({ apiKey: event.target.value })
                      }
                      placeholder="留空表示不修改"
                      disabled={!ready}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="admin-icon-button"
                      onClick={() => setShowKey((current) => !current)}
                      aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                      title={showKey ? "隐藏 API Key" : "显示 API Key"}
                      disabled={!ready}
                    >
                      {showKey ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </button>
                  </div>
                  <p className="admin-field-help">
                    <span className="settings-masked">
                      {maskedKey ? "已保存：" + maskedKey : "尚未保存 API Key"}
                    </span>
                    <span> · 留空表示不修改</span>
                  </p>
                </div>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => void handleTest()}
                  disabled={!ready || testing}
                  aria-busy={testing}
                >
                  {testing ? "测试中…" : "测试连接"}
                </button>
                <span className="settings-test-hint">
                  测试使用已保存配置
                </span>

                {saveStatus ? (
                  <span
                    className="settings-save-state"
                    data-tone={saveStatus.tone}
                    role="status"
                  >
                    {saveStatus.text}
                  </span>
                ) : null}

                <button
                  type="button"
                  className="admin-button admin-button--primary"
                  onClick={() => void handleSave()}
                  disabled={!ready || saving}
                  aria-busy={saving}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>

              {testResult ? (
                <div
                  className="settings-test-result"
                  data-tone={testResult.ok ? "success" : "error"}
                  role="status"
                >
                  <strong>{testResult.ok ? "连接成功" : "连接失败"}</strong>
                  {testResult.ok ? (
                    <span>
                      延迟 {testResult.latencyMs ?? "—"}ms · 模型{" "}
                      {testResult.model || form.model || "—"}
                    </span>
                  ) : (
                    <span>
                      {testResult.error || "请检查 Base URL、Model 与 API Key"}
                      {testResult.latencyMs !== null
                        ? " · 延迟 " + testResult.latencyMs + "ms"
                        : ""}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="settings-form">
              <header className="settings-form-head">
                <div>
                  <h2>系统</h2>
                  <p>启动与运行信息</p>
                </div>
                <span className="settings-form-state">{formStateLabel}</span>
              </header>

              <div className="settings-switch-row">
                <div>
                  <span className="admin-field-label">开机自启动</span>
                  <p>系统启动时自动运行 SorarinBot</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autostart}
                  aria-label="开机自启动"
                  className="admin-switch"
                  data-on={autostart}
                  onClick={() => void handleToggleAutostart()}
                  disabled={!ready || autostartBusy}
                />
              </div>

              {autostartError ? (
                <p className="admin-error-text settings-system-error">
                  {autostartError}
                </p>
              ) : null}

              <div className="settings-readonly">
                <div className="settings-readonly-item">
                  <span className="settings-readonly-label">数据目录</span>
                  <code
                    className="settings-readonly-value"
                    title={dataPath || "—"}
                  >
                    {dataPath || "—"}
                  </code>
                </div>
                <div className="settings-readonly-item">
                  <span className="settings-readonly-label">版本</span>
                  <code className="settings-readonly-value">
                    {APP_VERSION}
                  </code>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
