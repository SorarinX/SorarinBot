package database

import (
	"database/sql"
	"sync"

	_ "modernc.org/sqlite"

	"github.com/sirupsen/logrus"
)

var (
	db   *sql.DB
	once sync.Once
)

// Store is a public wrapper that satisfies the Handler.DB interface.
var Store = &store{}

type store struct{}

func (*store) InsertMessage(sender, room, userMsg, botReply, model string, promptTokens, completionTokens, totalTokens int) {
	insertMessage(sender, room, userMsg, botReply, model, promptTokens, completionTokens, totalTokens)
}

type Row struct {
	ID               int    `json:"id"`
	Sender           string `json:"sender"`
	Room             string `json:"room"`
	UserMessage      string `json:"user_message"`
	BotReply         string `json:"bot_reply"`
	Model            string `json:"model"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	TotalTokens      int    `json:"total_tokens"`
}

// Open initializes the SQLite database and runs migrations.
func Open(path string) error {
	var err error
	once.Do(func() {
		db, err = sql.Open("sqlite", path)
		if err != nil {
			return
		}
		db.SetMaxOpenConns(1) // SQLite only supports one writer
		err = migrate()
	})
	return err
}

func migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sender TEXT NOT NULL,
			room TEXT DEFAULT '',
			user_message TEXT NOT NULL,
			bot_reply TEXT NOT NULL,
			model TEXT DEFAULT '',
			prompt_tokens INTEGER DEFAULT 0,
			completion_tokens INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			created_at TEXT DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

// InsertMessage persists a chat message exchange.
func InsertMessage(sender, room, userMsg, botReply, model string, promptTokens, completionTokens, totalTokens int) {
	insertMessage(sender, room, userMsg, botReply, model, promptTokens, completionTokens, totalTokens)
}

func insertMessage(sender, room, userMsg, botReply, model string, promptTokens, completionTokens, totalTokens int) {
	if db == nil {
		return
	}
	_, err := db.Exec(
		`INSERT INTO messages(sender, room, user_message, bot_reply, model, prompt_tokens, completion_tokens, total_tokens)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		sender, room, userMsg, botReply, model, promptTokens, completionTokens, totalTokens,
	)
	if err != nil {
		logrus.Errorf("db InsertMessage: %v", err)
	}
}

// QueryMessages returns paginated messages. Offset 0 = most recent.
func QueryMessages(limit, offset int) ([]Row, int) {
	if db == nil {
		return nil, 0
	}
	var total int
	_ = db.QueryRow(`SELECT COUNT(*) FROM messages`).Scan(&total)

	rows, err := db.Query(
		`SELECT id, sender, room, user_message, bot_reply, model,
		        prompt_tokens, completion_tokens, total_tokens
		 FROM messages ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		logrus.Errorf("db QueryMessages: %v", err)
		return nil, 0
	}
	defer rows.Close()

	var out []Row
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.ID, &r.Sender, &r.Room, &r.UserMessage, &r.BotReply,
			&r.Model, &r.PromptTokens, &r.CompletionTokens, &r.TotalTokens); err != nil {
			logrus.Errorf("db scan: %v", err)
			continue
		}
		out = append(out, r)
	}
	return out, total
}

// InsertLog persists a log entry for the Web UI.
func InsertLog(level, message string) {
	if db == nil {
		return
	}
	_, err := db.Exec(`INSERT INTO logs(level, message) VALUES(?, ?)`, level, message)
	if err != nil {
		logrus.Errorf("db InsertLog: %v", err)
	}
}

// QueryLogs returns recent log entries.
func QueryLogs(limit, offset int) []string {
	if db == nil {
		return nil
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := db.Query(
		`SELECT level || ' | ' || message || ' | ' || created_at FROM logs ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		logrus.Errorf("db QueryLogs: %v", err)
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			continue
		}
		out = append(out, line)
	}
	return out
}
