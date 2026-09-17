package main

// Dashboard authentication.
//
// The web UI exposes chat history, system logs and the provider API key, so it
// must not be readable by anyone who can reach the port. Authentication is
// opt-in: while admin.password_hash is empty the server behaves exactly as it
// did before, which keeps a localhost-only install zero-config. Once a password
// is set with `SorarinBot -set-password`, every /api route and the heartbeat
// socket require a session cookie.
//
// Deliberately standard library only — crypto/pbkdf2 for the password and
// crypto/hmac for the session cookie — so the project keeps its five direct
// dependencies and stays a single static binary with no CGO.
//
// The dashboard is served over plain HTTP. This keeps a stranger on the same
// network out of your chat history; it does not protect the session cookie from
// someone who can capture the traffic. Do not expose the port to the internet.

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"SorarinBot/core/config"

	"github.com/sirupsen/logrus"
)

const (
	// pbkdf2Iterations follows the OWASP recommendation for PBKDF2-HMAC-SHA256.
	pbkdf2Iterations = 600_000
	pbkdf2KeyLength  = 32

	sessionCookieName = "sorarinbot_session"
	sessionTTL        = 7 * 24 * time.Hour

	// Login throttling, tracked per client IP.
	maxLoginFailures = 8
	failureWindow    = 5 * time.Minute

	// maxThrottleEntries bounds the failure map so an attacker cannot grow it
	// without limit by connecting from many addresses.
	maxThrottleEntries = 1024
)

// hashPassword encodes a password as:
//
//	pbkdf2-sha256$<iterations>$<salt-b64>$<key-b64>
//
// The iteration count is stored in the string so a future increase does not
// invalidate existing hashes.
func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("read salt: %w", err)
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, pbkdf2Iterations, pbkdf2KeyLength)
	if err != nil {
		return "", fmt.Errorf("derive key: %w", err)
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s",
		pbkdf2Iterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// verifyPassword reports whether password matches an encoded hash. The derived
// keys are compared in constant time.
func verifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1000 || iter > 10_000_000 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

type failureRecord struct {
	count int
	last  time.Time
}

type authenticator struct {
	encoded string // empty means authentication is disabled
	key     []byte // HMAC key for session cookies, fresh on every start

	mu       sync.Mutex
	failures map[string]*failureRecord
}

// newAuthenticator reads the configured password hash and generates a session
// signing key. It performs no expensive work, so it is cheap to construct.
func newAuthenticator() *authenticator {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		// A predictable key would let anyone mint a valid session, so this is
		// fatal rather than a warning.
		logrus.Fatalf("auth: cannot generate session key: %v", err)
	}

	encoded := strings.TrimSpace(config.Snapshot().Admin.PasswordHash)
	a := &authenticator{encoded: encoded, key: key, failures: make(map[string]*failureRecord)}

	if encoded == "" {
		logrus.Warn("dashboard authentication is disabled (admin.password_hash is empty)")
	} else if !strings.HasPrefix(encoded, "pbkdf2-sha256$") {
		// Refuse to run with a hash we do not understand rather than silently
		// falling open or locking the operator out.
		logrus.Fatalf("auth: admin.password_hash is not a pbkdf2-sha256 hash; " +
			"regenerate it with `SorarinBot -set-password`")
	} else {
		logrus.Info("dashboard authentication is enabled")
	}
	return a
}

func (a *authenticator) enabled() bool { return a.encoded != "" }

// ── session cookies ──────────────────────────────────────────────────

func (a *authenticator) sign(message string) string {
	mac := hmac.New(sha256.New, a.key)
	mac.Write([]byte(message))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a *authenticator) sessionValue() string {
	expiry := strconv.FormatInt(time.Now().Add(sessionTTL).Unix(), 10)
	return expiry + "." + a.sign(expiry)
}

func (a *authenticator) validSession(r *http.Request) bool {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return false
	}
	expiry, signature, ok := strings.Cut(cookie.Value, ".")
	if !ok {
		return false
	}
	if subtle.ConstantTimeCompare([]byte(signature), []byte(a.sign(expiry))) != 1 {
		return false
	}
	deadline, err := strconv.ParseInt(expiry, 10, 64)
	if err != nil {
		return false
	}
	return time.Now().Unix() < deadline
}

// ── middleware ───────────────────────────────────────────────────────

// publicAPIPaths stay reachable without a session, because the dashboard needs
// them to work out whether it should render a login screen.
var publicAPIPaths = map[string]bool{
	"/api/auth/status": true,
	"/api/auth/login":  true,
	"/api/auth/logout": true,
}

// middleware guards the API and the heartbeat socket. Static assets are left
// alone on purpose: the SPA shell holds no data, and serving it lets the login
// page load.
func (a *authenticator) middleware(next http.Handler) http.Handler {
	if !a.enabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		protected := strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws"
		if !protected || publicAPIPaths[r.URL.Path] || a.validSession(r) {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "authentication required"})
	})
}

// ── handlers ─────────────────────────────────────────────────────────

func (a *authenticator) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{
		"required":      a.enabled(),
		"authenticated": !a.enabled() || a.validSession(r),
	})
}

func (a *authenticator) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	if !a.enabled() {
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		return
	}

	ip := clientIP(r)
	if wait := a.throttled(ip); wait > 0 {
		w.WriteHeader(http.StatusTooManyRequests)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": fmt.Sprintf("尝试次数过多，请在 %d 秒后重试", int(wait.Seconds())+1),
		})
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "请求格式错误"})
		return
	}

	if !verifyPassword(a.encoded, body.Password) {
		a.recordFailure(ip)
		logrus.Warnf("auth: rejected login from %s", ip)
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "密码错误"})
		return
	}

	a.clearFailures(ip)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    a.sessionValue(),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionTTL.Seconds()),
	})
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func (a *authenticator) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Clearing the cookie is the whole logout: sessions carry no server state,
	// so there is nothing else to invalidate.
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ── login throttling ─────────────────────────────────────────────────

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// throttled reports how long the caller must wait before another attempt, or
// zero when it may try now.
func (a *authenticator) throttled(ip string) time.Duration {
	a.mu.Lock()
	defer a.mu.Unlock()

	rec, ok := a.failures[ip]
	if !ok {
		return 0
	}
	elapsed := time.Since(rec.last)
	if elapsed > failureWindow {
		delete(a.failures, ip)
		return 0
	}
	if rec.count < maxLoginFailures {
		return 0
	}
	return failureWindow - elapsed
}

func (a *authenticator) recordFailure(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if len(a.failures) >= maxThrottleEntries {
		for key, rec := range a.failures {
			if time.Since(rec.last) > failureWindow {
				delete(a.failures, key)
			}
		}
		// Still full after pruning: drop everything rather than grow. The cost
		// is that a flood of unique addresses resets the counters, which is
		// strictly better than unbounded memory.
		if len(a.failures) >= maxThrottleEntries {
			a.failures = make(map[string]*failureRecord)
		}
	}

	rec, ok := a.failures[ip]
	if !ok || time.Since(rec.last) > failureWindow {
		a.failures[ip] = &failureRecord{count: 1, last: time.Now()}
		return
	}
	rec.count++
	rec.last = time.Now()
}

func (a *authenticator) clearFailures(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}
