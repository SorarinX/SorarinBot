package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"SorarinBot/core/config"
	"SorarinBot/core/message"
	"SorarinBot/core/session"
	"SorarinBot/database"
	"SorarinBot/providers"
	"SorarinBot/providers/openaicompat"
	ow_adapter "SorarinBot/adapters/openwechat"

	"github.com/sirupsen/logrus"
)

//go:embed web/dist
var uiFS embed.FS

var startupTime = time.Now()

func main() {
	// Always run from exe directory so relative paths work on double-click
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)
	if exeDir != "" {
		_ = os.Chdir(exeDir)
	}

	// If exe directory is not writable (e.g. Program Files), use %APPDATA%/SorarinBot
	dataDir := exeDir
	if !isDirWritable(exeDir) {
		appData := os.Getenv("APPDATA")
		if appData != "" {
			dataDir = filepath.Join(appData, "SorarinBot")
			os.MkdirAll(dataDir, 0755)
		}
	}
	if dataDir != exeDir {
		logrus.Infof("data directory: %s", dataDir)
	}

	// Config
	if err := config.Load(); err != nil {
		logrus.Fatalf("config load: %v", err)
	}
	cfg := &config.Cfg

	// Override data paths if exe directory is not writable
	if dataDir != exeDir {
		cfg.DB.Path = filepath.Join(dataDir, "data.db")
		cfg.WeChat.TokenFile = filepath.Join(dataDir, "token.json")
	}

	banner := []string{
		"███████╗ ██████╗ ██████╗  █████╗ ██████╗ ██╗███╗   ██╗",
		"██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║",
		"███████╗██║   ██║██████╔╝███████║██████╔╝██║██╔██╗ ██║",
		"╚════██║██║   ██║██╔══██╗██╔══██║██╔══██╗██║██║╚██╗██║",
		"███████║╚██████╔╝██║  ██║██║  ██║██║  ██║██║██║ ╚████║",
		"╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝",
		"",
		"                ██████╗  ██████╗ ████████╗",
		"                ██╔══██╗██╔═══██╗╚══██╔══╝",
		"                ██████╔╝██║   ██║   ██║",
		"                ██╔══██╗██║   ██║   ██║",
		"                ██████╔╝╚██████╔╝   ██║",
		"                ╚═════╝  ╚═════╝    ╚═╝",
		"",
		"              ✦ SorarinBot AI Assistant ✦",
		"         Modern · Fast · OpenAI Compatible",
	}

	// Find max line width for centering
	maxWidth := 0
	for _, line := range banner {
		if len(line) > maxWidth {
			maxWidth = len(line)
		}
	}
	// Terminal width (default 120, can adjust)
	termWidth := 120
	padding := (termWidth - maxWidth) / 2
	if padding < 0 {
		padding = 0
	}
	fmt.Println()
	for _, line := range banner {
		fmt.Printf("%*s%s\n", padding, "", line)
	}
	fmt.Println()

	// Build provider from config
	p := buildProviderFromCfg(cfg)

	// Sessions
	sessMgr := session.NewManager(cfg.Prompt, cfg.Chat.MaxContext)

	// Database
	if err := database.Open(cfg.DB.Path); err != nil {
		logrus.Fatalf("database open: %v", err)
	}

	// Enable logrus → database hook so all logs appear in web UI
	database.InitLogrusHook()

	h := &message.Handler{
		Provider: p,
		Sessions: sessMgr,
		ImageTTL: 5 * time.Minute,
		DB:       database.Store,
	}

	ctx, cancel := context.WithCancel(context.Background())

	// Start wechat adapter
	adapter, err := ow_adapter.NewAdapter(ctx, cfg, h, sessMgr)
	if err != nil {
		logrus.Fatalf("adapter init: %v", err)
	}

	// Hide console on successful WeChat login
	adapter.SetOnLoginSuccess(func() {
		hideConsoleWindow()
	})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := adapter.Start(); err != nil {
			logrus.Fatalf("wechat start: %v", err)
		}
	}()

	// Start web server
	wg.Add(1)
	go func() {
		defer wg.Done()
		startWeb(ctx, cfg.Web.Listen, h, sessMgr)
	}()

	// Graceful shutdown
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)

	// System tray (skip inside Electron)
	if os.Getenv("SORARINBOT_ELECTRON") == "" {
		go func() {
			iconPath := filepath.Join(filepath.Dir(os.Args[0]), "icon.ico")
			InitTray(TrayConfig{
				WebURL:   "http://" + cfg.Web.Listen,
				IconPath: iconPath,
				OnExit: func() {
					logrus.Info("[tray] quit requested")
					ch <- syscall.SIGTERM
				},
				OnAutoStart: func(enabled bool) {
					if err := setAutostart(enabled); err != nil {
						logrus.Errorf("[tray] autostart error: %v", err)
					} else {
						logrus.Infof("[tray] autostart: %v", enabled)
					}
				},
				IsAutoStart: func() bool {
					return getAutostart()
				},
			})
		}()
	}

	// Auto-open browser shortly after startup (skip if running inside Electron)
	go func() {
		time.Sleep(1 * time.Second)
		if os.Getenv("SORARINBOT_ELECTRON") == "" {
			openBrowser("http://" + cfg.Web.Listen)
		}
	}()

	// Exit when either OS signal or browser heartbeat timeout
	select {
	case <-ch:
		logrus.Info("shutting down (signal)...")
	case <-heartbeat.Done():
		logrus.Info("shutting down (browser closed)...")
	}
	logrus.Info("shutting down...")
	adapter.Bot.Exit()
	cancel()
	_ = adapter.Bot.Block()
	wg.Wait()
	logrus.Info("bye")
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	if isWin {
		cmd = exec.Command("cmd", "/c", "start", url)
	} else {
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		logrus.Debugf("open browser: %v", err)
	}
}

var isWin bool

func init() {
	isWin = len(os.Getenv("WINDIR")) > 0
}

// pickKey returns config key first, then env var for backward compat.
func pickKey(cfgKey, envKey string) string {
	if cfgKey != "" {
		return cfgKey
	}
	return os.Getenv(envKey)
}

func buildProviderFromCfg(cfg *config.Config) providers.Provider {
	pc := &cfg.Provider
	name := pc.Name
	if name == "" {
		name = "openaicompat"
	}

	var c openaicompat.Config
	switch name {
	case "minimax":
		model := pc.Model
		if model == "" {
			model = "MiniMax-M3"
		}
		c = openaicompat.Config{
			Name:    "minimax",
			BaseURL: "https://api.minimaxi.com/v1",
			APIKey:  pickKey(pc.APIKey, "MINIMAX_API_KEY"),
			Model:   model,
		}
	case "deepseek":
		c = openaicompat.Config{
			Name:    "deepseek",
			BaseURL: "https://api.deepseek.com",
			APIKey:  pickKey(pc.APIKey, "DEEPSEEK_API_KEY"),
			Model:   pc.Model,
		}
	case "openai":
		model := pc.Model
		if model == "" {
			model = "gpt-4o"
		}
		c = openaicompat.Config{
			Name:    "openai",
			BaseURL: "https://api.openai.com/v1",
			APIKey:  pickKey(pc.APIKey, "OPENAI_API_KEY"),
			Model:   model,
		}
	default: // openaicompat — user fills everything
		c = openaicompat.Config{
			Name:    name,
			BaseURL: pc.BaseURL,
			APIKey:  pc.APIKey,
			Model:   pc.Model,
		}
	}
	p := openaicompat.New(c)
	logrus.Infof("provider: %s, model=%s, vision=%v", p.Name(), c.Model, p.SupportsVision())
	return p
}

func buildMux(h *message.Handler, sm *session.Manager) http.Handler {
	mux := http.NewServeMux()

	// SPA: serve static files from web/dist/, fallback to index.html
	distFS, err := fs.Sub(uiFS, "web/dist")
	if err != nil {
		logrus.Fatalf("embed fs: %v", err)
	}

	// Serve static files with proper MIME types
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// API routes handled separately
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		// Clean the path
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		logrus.Debugf("Serving path: %s -> %s", r.URL.Path, path)

		// Try to open the file
		f, err := distFS.Open(path)
		if err != nil {
			logrus.Debugf("File not found: %s, serving index.html", path)
			// File not found → serve index.html (SPA fallback)
			f2, err2 := distFS.Open("index.html")
			if err2 != nil {
				http.Error(w, "UI not built", 500)
				return
			}
			defer f2.Close()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			io.Copy(w, f2)
			return
		}
		defer f.Close()

		// Get file info for content type detection
		stat, err := f.Stat()
		if err != nil {
			http.Error(w, "Internal error", 500)
			return
		}

		// If it's a directory, serve index.html
		if stat.IsDir() {
			f2, err2 := distFS.Open(path + "/index.html")
			if err2 != nil {
				// Try root index.html
				f2, err2 = distFS.Open("index.html")
				if err2 != nil {
					http.Error(w, "UI not built", 500)
					return
				}
			}
			defer f2.Close()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			io.Copy(w, f2)
			return
		}

		// Detect content type from file extension
		ext := filepath.Ext(path)
		contentType := mime.TypeByExtension(ext)
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)

		// Seek to beginning of file before serving
		if seeker, ok := f.(io.Seeker); ok {
			seeker.Seek(0, io.SeekStart)
		}

		// Serve the file content
		io.Copy(w, f)
	})

	// API — status
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		cfg := config.Snapshot()
		apiKeyCfg := cfg.Provider.APIKey != ""
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":             "running",
			"sessions":           sm.Names(),
			"provider":           cfg.Provider.Name,
			"model":              cfg.Provider.Model,
			"startup_at":         startupTime.Format(time.RFC3339),
			"api_key_configured": apiKeyCfg,
			"electron":           os.Getenv("SORARINBOT_ELECTRON") != "",
		})
	})

	// API — sessions
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(sm.Names())
	})
	mux.HandleFunc("/api/session", func(w http.ResponseWriter, r *http.Request) {
		user := r.URL.Query().Get("user")
		sess := sm.Get(user)
		if sess == nil {
			http.NotFound(w, r)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"user":  user,
			"pairs": sess.PairCount(),
			"dump":  sess.Dump(),
		})
	})

	// Chat history
	mux.HandleFunc("/api/history", func(w http.ResponseWriter, r *http.Request) {
		limit, offset := parsePagination(r)
		rows, total := database.QueryMessages(limit, offset)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"rows":  rows,
			"total": total,
		})
	})

	// Logs
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			database.ClearLogs()
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		if limit > 1000 {
			limit = 1000
		}
		json.NewEncoder(w).Encode(database.QueryLogs(limit, 0))
	})

	// API — test provider connection
	mux.HandleFunc("/api/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
		pc := config.Snapshot().Provider
		if pc.APIKey == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "API Key 未配置",
			})
			return
		}
		if pc.BaseURL == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "Base URL 未配置",
			})
			return
		}
		model := pc.Model
		if model == "" {
			model = "unknown"
		}

		tc := openaicompat.Config{
			Name:    pc.Name,
			BaseURL: pc.BaseURL,
			APIKey:  pc.APIKey,
			Model:   model,
		}
		client := openaicompat.New(tc)
		chatCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		start := time.Now()
		resp, err := client.Chat(chatCtx, providers.ChatRequest{
			Model:   model,
			Messages: []providers.ChatMessage{
				{Role: "user", Content: "Hi"},
			},
			MaxTokens: 5,
		})
		latency := time.Since(start).Milliseconds()

		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":       false,
				"error":    err.Error(),
				"latency_ms": latency,
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"latency_ms": latency,
			"model":      resp.Model,
		})
	})

	// API — list models (OpenAI-compatible /v1/models)
	mux.HandleFunc("/api/models", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", 405)
			return
		}
		pc := config.Snapshot().Provider
		if pc.BaseURL == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "Base URL 未配置",
			})
			return
		}
		baseURL := strings.TrimRight(pc.BaseURL, "/")
		req, _ := http.NewRequest("GET", baseURL+"/models", nil)
		if pc.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+pc.APIKey)
		}
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("请求失败: %v", err),
			})
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("API %d: %s", resp.StatusCode, string(body)),
			})
			return
		}
		var modelResp struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &modelResp); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("解析失败: %v", err),
			})
			return
		}
		ids := make([]string, 0, len(modelResp.Data))
		for _, m := range modelResp.Data {
			ids = append(ids, m.ID)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":     true,
			"models": ids,
		})
	})

	// Config read / write
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			cfg := config.Snapshot()
			providerOut := cfg.Provider
			if providerOut.APIKey != "" && len(providerOut.APIKey) > 8 {
				providerOut.APIKey = providerOut.APIKey[:4] + "••••" + providerOut.APIKey[len(providerOut.APIKey)-4:]
			} else if providerOut.APIKey != "" {
				providerOut.APIKey = "••••••••"
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"provider": providerOut,
				"prompt":   cfg.Prompt,
				"chat":     cfg.Chat,
				"wechat":   cfg.WeChat,
				"web":      cfg.Web,
				"database": cfg.DB,
			})
		case http.MethodPut:
			var body struct {
				ProviderName *string `json:"provider_name"`
				BaseURL      *string `json:"base_url"`
				Model        *string `json:"model"`
				Prompt       *string `json:"prompt"`
				APIKey       *string `json:"api_key"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}

			// Snapshot under a read lock so we can mutate freely without
			// racing concurrent dashboard reads of Cfg.
			next := config.Snapshot()
			if body.ProviderName != nil {
				next.Provider.Name = *body.ProviderName
			}
			if body.BaseURL != nil {
				next.Provider.BaseURL = *body.BaseURL
			}
			if body.Model != nil {
				next.Provider.Model = *body.Model
			}
			if body.Prompt != nil {
				next.Prompt = *body.Prompt
				h.Sessions.SetPrompt(*body.Prompt)
			}
			if body.APIKey != nil {
				next.Provider.APIKey = *body.APIKey
			}

			// Publish the new config and persist atomically.
			config.Apply(next)
			p := buildProviderFromCfg(&next)
			h.SetProvider(p)
			if err := config.Save(); err != nil {
				logrus.Errorf("save config: %v", err)
			}
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		default:
			http.Error(w, "method not allowed", 405)
		}
	})

	// Auto-start management
	mux.HandleFunc("/api/autostart", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(map[string]interface{}{
				"enabled": getAutostart(),
			})
		case http.MethodPut:
			var body struct {
				Enabled bool `json:"enabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			if err := setAutostart(body.Enabled); err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"ok":    false,
					"error": err.Error(),
				})
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":      true,
				"enabled": body.Enabled,
			})
		default:
			http.Error(w, "method not allowed", 405)
		}
	})

	// WebSocket heartbeat for browser close detection
	mux.HandleFunc("/ws", heartbeat.handleWS)

	return mux
}

func parsePagination(r *http.Request) (limit, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ = strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 { limit = 100 }
	if limit > 1000 { limit = 1000 }
	if offset < 0 { offset = 0 }
	return
}

func startWeb(ctx context.Context, listen string, h *message.Handler, sm *session.Manager) {
	// Fix-24: build mux once, reuse for all port attempts
	handler := buildMux(h, sm)

	// Auto-retry with next port if current one is busy
	tryPort := func(addr string) bool {
		srv := &http.Server{
			Addr:    addr,
			Handler: handler,
		}
		logrus.Infof("web UI at http://%s", addr)

		go func() {
			<-ctx.Done()
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			srv.Shutdown(shutdownCtx)
		}()

		if err := srv.ListenAndServe(); err != nil {
			if err == http.ErrServerClosed {
				return true
			}
			logrus.Warnf("web listen %s: %v, trying next port", addr, err)
			return false
		}
		return true
	}

	if tryPort(listen) {
		return
	}

	host, portStr, err := net.SplitHostPort(listen)
	if err != nil {
		host = listen
		portStr = "8080"
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 8080
	}
	nextAddr := fmt.Sprintf("%s:%d", host, port+1)
	if !tryPort(nextAddr) {
		logrus.Fatalf("failed to listen on %s and %s", listen, nextAddr)
	}
}

func isDirWritable(dir string) bool {
	testFile := filepath.Join(dir, ".write_test_tmp")
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		return false
	}
	os.Remove(testFile)
	return true
}
