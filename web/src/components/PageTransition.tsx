import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import "../styles/transitions.css";

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
