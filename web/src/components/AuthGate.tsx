import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { setUnauthorizedHandler } from "../lib/http";
import { markUnauthenticated, useAuth } from "../lib/useAuth";
import "../styles/login.css";

export function AuthGate() {
  const { required, authenticated, loaded, probeFailed } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      markUnauthenticated();
      // Never bounce /login to /login; that is the loop the spec warns about.
      if (window.location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [navigate]);

  if (!loaded) {
    return (
      <div className="auth-loading" role="status" aria-label="正在检查登录状态">
        <span className="auth-spinner" aria-hidden="true" />
      </div>
    );
  }

  const isLogin = location.pathname === "/login";

  if (isLogin) {
    // With a failed status probe the console is open (A), but the login route
    // stays reachable so the backend-down demo can show the form + submit error (F).
    if (probeFailed) return <Outlet />;
    if (!required || authenticated) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Outlet />;
  }

  if (required && !authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
