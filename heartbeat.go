package main

import (
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// BrowserHeartbeat tracks connected browser tabs.
// When all browsers disconnect, the process exits after a grace period.
type BrowserHeartbeat struct {
	mu       sync.Mutex
	clients  map[*websocket.Conn]bool
	done     chan struct{}
	closed   bool
}

var heartbeat = &BrowserHeartbeat{
	clients: make(map[*websocket.Conn]bool),
	done:    make(chan struct{}),
}

func (h *BrowserHeartbeat) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	h.mu.Lock()
	h.clients[conn] = true
	count := len(h.clients)
	h.mu.Unlock()

	logrus.Debugf("[ws] browser connected, total: %d", count)

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		count = len(h.clients)
		h.mu.Unlock()

		logrus.Debugf("[ws] browser disconnected, remaining: %d", count)

		// If no browsers left, start shutdown timer
		if count == 0 {
			go h.gracefulShutdown()
		}
		conn.Close()
	}()

	// Read messages (heartbeat pings)
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *BrowserHeartbeat) gracefulShutdown() {
	time.Sleep(30 * time.Second)

	h.mu.Lock()
	count := len(h.clients)
	h.mu.Unlock()

	if count == 0 && !h.closed {
		h.closed = true
		logrus.Info("[ws] no browser connected for 30s, shutting down")
		// Show console window before exit so user sees the message
		showConsoleWindow()
		// Signal main to exit
		close(h.done)
	}
}

func (h *BrowserHeartbeat) Done() <-chan struct{} {
	return h.done
}
