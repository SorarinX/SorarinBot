import { useCallback, useEffect, useState } from "react";
import { getConfig, type AppConfig } from "./settings";

export type ConfigStatus = "loading" | "live" | "unavailable";

/**
 * Reads /api/config once for the settings and prompt pages. There is no poll:
 * configuration changes only through this UI. A failed read switches to the
 * unavailable state so the forms can render disabled instead of crashing.
 */
export function useConfigData() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<ConfigStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");

    getConfig()
      .then((next) => {
        if (!active) return;
        setConfig(next);
        setStatus("live");
      })
      .catch(() => {
        if (!active) return;
        setConfig(null);
        setStatus("unavailable");
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return { config, status, reload };
}
