import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { useAuth } from "../lib/useAuth";
import "../styles/login.css";

const APP_VERSION = "v2.4.0";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.documentElement.classList.add("login-active");
    document.title = "登录 · SorarinBot";

    // Keep the password field focused even if autoFocus lost the race with the
    // route guard's first paint.
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);

    return () => {
      document.documentElement.classList.remove("login-active");
      document.title = previousTitle;
      window.clearTimeout(focusTimer);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!password) {
      inputRef.current?.focus();
      return;
    }

    setPending(true);
    setError("");

    const result = await login(password);

    if (result.ok) {
      navigate("/dashboard", { replace: true });
      return;
    }

    setPending(false);
    setError(result.error || "密码错误");
    setPassword("");
    inputRef.current?.focus();
  }

  return (
    <div className="login-page">
      <span className="login-version">{APP_VERSION}</span>

      <div className="login-ambient login-ambient--mint" aria-hidden="true" />
      <div className="login-ambient login-ambient--gold" aria-hidden="true" />
      <div className="login-halo" aria-hidden="true" />

      <main className="login-card">
        <h1 className="login-brand">SorarinBot</h1>
        <p className="login-subtitle">请输入管理密码</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div
            className="login-input-wrap"
            data-invalid={error ? "true" : undefined}
          >
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              className="login-input"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
              placeholder="管理密码"
              aria-label="管理密码"
              autoFocus
              autoComplete="current-password"
              disabled={pending}
            />

            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              title={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>

          <div className="login-error-slot" aria-live="polite">
            {error ? (
              <p className="login-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                登录中…
              </>
            ) : (
              "登录"
            )}
          </button>
        </form>

        <p className="login-help">
          忘记密码？在程序目录运行{" "}
          <code>SorarinBot -set-password</code>
        </p>
      </main>
    </div>
  );
}
