package main

import (
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fastHash builds a valid encoded hash with a low iteration count so the suite
// does not spend hundreds of milliseconds per case. verifyPassword reads the
// count from the string, so this exercises the same code path.
func fastHash(t *testing.T, password string, iter int) string {
	t.Helper()
	salt := []byte("0123456789abcdef")
	key, err := pbkdf2.Key(sha256.New, password, salt, iter, 32)
	if err != nil {
		t.Fatalf("pbkdf2: %v", err)
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s",
		iter,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key))
}

func newTestAuth(encoded string) *authenticator {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	return &authenticator{encoded: encoded, key: key, failures: make(map[string]*failureRecord)}
}

func TestHashPasswordRoundTrip(t *testing.T) {
	encoded, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}

	if !strings.HasPrefix(encoded, "pbkdf2-sha256$") {
		t.Fatalf("encoded hash %q is missing the algorithm prefix", encoded)
	}
	if !verifyPassword(encoded, "correct horse battery staple") {
		t.Error("verifyPassword rejected the password it was derived from")
	}
	if verifyPassword(encoded, "Correct horse battery staple") {
		t.Error("verifyPassword accepted a different password")
	}
	if verifyPassword(encoded, "") {
		t.Error("verifyPassword accepted an empty password")
	}
}

// TestHashPasswordIsSalted guards against a regression where the same password
// would always produce the same hash, which makes the stored value crackable
// with a rainbow table.
func TestHashPasswordIsSalted(t *testing.T) {
	first, err := hashPassword("hunter2000")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	second, err := hashPassword("hunter2000")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if first == second {
		t.Error("two hashes of the same password are identical; salt is not random")
	}
	if !verifyPassword(first, "hunter2000") || !verifyPassword(second, "hunter2000") {
		t.Error("at least one of the two hashes failed to verify")
	}
}

func TestVerifyPasswordRejectsMalformedInput(t *testing.T) {
	valid := fastHash(t, "secret", 1000)
	parts := strings.Split(valid, "$")

	cases := map[string]string{
		"empty":            "",
		"no separators":    "not-a-hash",
		"wrong algorithm":  "bcrypt$1000$" + parts[2] + "$" + parts[3],
		"too few fields":   "pbkdf2-sha256$1000$" + parts[2],
		"non-numeric iter": "pbkdf2-sha256$abc$" + parts[2] + "$" + parts[3],
		"iter below floor": "pbkdf2-sha256$10$" + parts[2] + "$" + parts[3],
		"iter above cap":   "pbkdf2-sha256$99999999$" + parts[2] + "$" + parts[3],
		"bad salt base64":  "pbkdf2-sha256$1000$!!!!$" + parts[3],
		"bad key base64":   "pbkdf2-sha256$1000$" + parts[2] + "$!!!!",
		"empty key":        "pbkdf2-sha256$1000$" + parts[2] + "$",
	}

	for name, encoded := range cases {
		if verifyPassword(encoded, "secret") {
			t.Errorf("%s: verifyPassword accepted a malformed hash", name)
		}
	}
}

func TestAuthenticatorEnabled(t *testing.T) {
	if newTestAuth("").enabled() {
		t.Error("an empty hash must mean authentication is disabled")
	}
	if !newTestAuth(fastHash(t, "secret", 1000)).enabled() {
		t.Error("a configured hash must mean authentication is enabled")
	}
}

func TestSessionCookieRoundTrip(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))

	rec := httptest.NewRecorder()
	http.SetCookie(rec, &http.Cookie{Name: sessionCookieName, Value: a.sessionValue()})
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.AddCookie(rec.Result().Cookies()[0])

	if !a.validSession(req) {
		t.Error("a freshly issued session was rejected")
	}
}

func TestValidSessionRejectsTampering(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	value := a.sessionValue()

	cases := map[string]string{
		"no separator":     "garbage",
		"empty":            "",
		"forged signature": strings.Split(value, ".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"tampered expiry":  "99999999999." + strings.Split(value, ".")[1],
		"truncated":        value[:len(value)-2],
	}

	for name, cookieValue := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookieValue})
		if a.validSession(req) {
			t.Errorf("%s: tampered cookie was accepted", name)
		}
	}

	// A cookie signed with a different key must not validate, which is what
	// makes a restart invalidate every outstanding session.
	other := newTestAuth(fastHash(t, "secret", 1000))
	other.key[0] ^= 0xFF
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: other.sessionValue()})
	if a.validSession(req) {
		t.Error("a cookie signed with a foreign key was accepted")
	}
}

func TestValidSessionRejectsExpired(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	expired := fmt.Sprintf("%d", time.Now().Add(-time.Minute).Unix())

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: expired + "." + a.sign(expired)})

	if a.validSession(req) {
		t.Error("an expired session was accepted")
	}
}

func TestMiddlewareBlocksUnauthenticatedAPI(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	handler := a.middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("reached"))
	}))

	cases := []struct {
		path string
		want int
	}{
		{"/api/status", http.StatusUnauthorized},
		{"/api/config", http.StatusUnauthorized},
		{"/api/history", http.StatusUnauthorized},
		{"/ws", http.StatusUnauthorized},
		// Reachable without a session so the login screen can be rendered.
		{"/api/auth/status", http.StatusOK},
		{"/api/auth/login", http.StatusOK},
		{"/api/auth/logout", http.StatusOK},
		// Static assets stay open: the SPA shell holds no data.
		{"/", http.StatusOK},
		{"/assets/app.js", http.StatusOK},
	}

	for _, tc := range cases {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.want {
			t.Errorf("%s: got status %d, want %d", tc.path, rec.Code, tc.want)
		}
	}
}

func TestMiddlewarePassesEverythingThroughWhenDisabled(t *testing.T) {
	a := newTestAuth("")
	handler := a.middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, path := range []string{"/api/status", "/api/config", "/ws"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("%s: got status %d with auth disabled, want 200", path, rec.Code)
		}
	}
}

func TestHandleStatusReportsRequirement(t *testing.T) {
	body := func(a *authenticator) map[string]bool {
		rec := httptest.NewRecorder()
		a.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/auth/status", nil))
		var out map[string]bool
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return out
	}

	off := body(newTestAuth(""))
	if off["required"] || !off["authenticated"] {
		t.Errorf("auth disabled: got %v, want required=false authenticated=true", off)
	}

	on := body(newTestAuth(fastHash(t, "secret", 1000)))
	if !on["required"] || on["authenticated"] {
		t.Errorf("auth enabled without a cookie: got %v, want required=true authenticated=false", on)
	}
}

func postLogin(a *authenticator, remoteAddr, password string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(fmt.Sprintf(`{"password":%q}`, password)))
	req.RemoteAddr = remoteAddr
	rec := httptest.NewRecorder()
	a.handleLogin(rec, req)
	return rec
}

func TestHandleLoginSetsCookieOnSuccess(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))

	rec := postLogin(a, "10.0.0.1:1234", "secret")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != sessionCookieName {
		t.Errorf("cookie name = %q, want %q", cookie.Name, sessionCookieName)
	}
	if !cookie.HttpOnly {
		t.Error("session cookie is not HttpOnly")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.AddCookie(cookie)
	if !a.validSession(req) {
		t.Error("the cookie issued by a successful login does not validate")
	}
}

func TestHandleLoginRejectsWrongPassword(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))

	rec := postLogin(a, "10.0.0.2:1234", "wrong")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Error("a failed login must not issue a cookie")
	}
}

func TestHandleLoginThrottlesRepeatedFailures(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	const ip = "10.0.0.3:1234"

	for i := 0; i < maxLoginFailures; i++ {
		if rec := postLogin(a, ip, "wrong"); rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: got status %d, want 401", i+1, rec.Code)
		}
	}

	rec := postLogin(a, ip, "wrong")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d after %d failures, want 429", rec.Code, maxLoginFailures)
	}

	// The correct password must not be accepted while the caller is throttled,
	// otherwise the limit buys nothing.
	if rec := postLogin(a, ip, "secret"); rec.Code != http.StatusTooManyRequests {
		t.Errorf("throttled caller got status %d with the right password, want 429", rec.Code)
	}

	// A different address is unaffected: the counter is per IP.
	if rec := postLogin(a, "10.0.0.4:1234", "secret"); rec.Code != http.StatusOK {
		t.Errorf("unrelated address got status %d, want 200", rec.Code)
	}
}

func TestSuccessfulLoginClearsFailureCount(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	const ip = "10.0.0.5:1234"

	postLogin(a, ip, "wrong")
	postLogin(a, ip, "wrong")

	if rec := postLogin(a, ip, "secret"); rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}

	a.mu.Lock()
	remaining := a.failures[ip]
	a.mu.Unlock()
	if remaining != nil {
		t.Errorf("failure record survived a successful login: %+v", remaining)
	}
}

func TestHandleLogoutClearsCookie(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))

	rec := httptest.NewRecorder()
	a.handleLogout(rec, httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	if cookies[0].MaxAge >= 0 {
		t.Errorf("logout cookie MaxAge = %d, want a negative value to delete it", cookies[0].MaxAge)
	}
}

func TestLoginRejectsNonPost(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))
	rec := httptest.NewRecorder()
	a.handleLogin(rec, httptest.NewRequest(http.MethodGet, "/api/auth/login", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("got status %d, want 405", rec.Code)
	}
}

// TestThrottleMapStaysBounded checks that a flood of distinct addresses cannot
// grow the failure map without limit.
func TestThrottleMapStaysBounded(t *testing.T) {
	a := newTestAuth(fastHash(t, "secret", 1000))

	for i := 0; i < maxThrottleEntries*2; i++ {
		a.recordFailure(fmt.Sprintf("10.1.%d.%d:1234", i/256, i%256))
	}

	a.mu.Lock()
	size := len(a.failures)
	a.mu.Unlock()

	if size > maxThrottleEntries {
		t.Errorf("failure map grew to %d entries, want at most %d", size, maxThrottleEntries)
	}
}

func TestCleanPassword(t *testing.T) {
	// What Windows PowerShell 5.1 actually puts on the pipe: a UTF-8 BOM
	// followed by the text. Without cleaning, the stored hash would be of
	// "\ufeffpassword" and the operator could never log in with what they typed.
	const piped = "\ufeffcorrect-horse\r\n"

	cases := map[string]struct {
		in      string
		want    string
		wantErr bool
	}{
		"plain line":        {"correct-horse\n", "correct-horse", false},
		"crlf line":         {"correct-horse\r\n", "correct-horse", false},
		"piped from shell":  {piped, "correct-horse", false},
		"utf16 residue":     {"t\x00e\x00s\x00t\x00\r\x00\n\x00", "test", false},
		"empty":             {"\n", "", false},
		"only nuls":         {"\x00\x00\n", "", false},
		"only a bom":        {"\ufeff\n", "", false},
		"inner newline":     {"pass\nword", "", true},
		"tab character":     {"pass\tword", "", true},
		"bell character":    {"pass\aword", "", true},
		"bom in the middle": {"pass\ufeffword", "", true},
		"invalid utf-8":     {string([]byte{0xff, 0xfe, 'a', 'b'}), "", true},
		"unicode is fine":   {"密码密码密码", "密码密码密码", false},
		"emoji is fine":     {"correct-horse-🐴", "correct-horse-🐴", false},
		"spaces are kept":   {"pass word", "pass word", false},
	}

	for name, tc := range cases {
		got, err := cleanPassword(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("%s: expected an error, got %q", name, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: unexpected error: %v", name, err)
			continue
		}
		if got != tc.want {
			t.Errorf("%s: got %q, want %q", name, got, tc.want)
		}
	}
}
