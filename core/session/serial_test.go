package session

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"SorarinBot/providers"
)

// ── Gate-2 (P5-1 / P5-2): serial worker ─────────────────────────────

func startTestSession(t *testing.T, key string) (*Manager, *Session, context.CancelFunc, *sync.WaitGroup) {
	t.Helper()
	m := NewManager("p", 5)
	s := m.Get(key)
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)
	t.Cleanup(func() {
		cancel()
		s.Stop()
		wg.Wait()
	})
	return m, s, cancel, &wg
}

// T-1.1: tasks for one SessionKey must run strictly one at a time, in the
// order they were enqueued. The assertion is on the internal event
// sequence only — never on WeChat delivery order.
func TestRunSerialStrictOrdering(t *testing.T) {
	_, s, _, _ := startTestSession(t, "private:a")

	var mu sync.Mutex
	var events []string
	const n = 5

	for i := 1; i <= n; i++ {
		i := i
		if !s.RunSerial(func(context.Context) {
			mu.Lock()
			events = append(events, fmt.Sprintf("begin%d", i))
			mu.Unlock()
			time.Sleep(2 * time.Millisecond) // simulate work
			mu.Lock()
			events = append(events, fmt.Sprintf("end%d", i))
			mu.Unlock()
		}) {
			t.Fatalf("RunSerial rejected task %d", i)
		}
	}

	// Wait for the worker to drain.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if s.Pending() == 0 {
			time.Sleep(50 * time.Millisecond)
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(events) != 2*n {
		t.Fatalf("expected %d events, got %d: %v", 2*n, len(events), events)
	}
	// Strictly serial and FIFO: begin1 end1 begin2 end2 ... begin5 end5.
	for i := 1; i <= n; i++ {
		if got, want := events[2*(i-1)], fmt.Sprintf("begin%d", i); got != want {
			t.Fatalf("event %d = %q, want %q (full: %v)", 2*(i-1), got, want, events)
		}
		if got, want := events[2*(i-1)+1], fmt.Sprintf("end%d", i); got != want {
			t.Fatalf("event %d = %q, want %q (full: %v)", 2*(i-1)+1, got, want, events)
		}
	}
}

// T-1.1 (context half): each task must observe the history written by the
// task before it, proving Append of iteration N completes before N+1 starts.
func TestRunSerialSeesPriorAppend(t *testing.T) {
	m, s, _, _ := startTestSession(t, "private:a")

	var seen []int
	var mu sync.Mutex
	const n = 5

	for i := 1; i <= n; i++ {
		i := i
		s.RunSerial(func(context.Context) {
			// Read history exactly as the handler does.
			before := s.PairCount()
			s.Append(fmt.Sprintf("q%d", i), fmt.Sprintf("a%d", i))
			mu.Lock()
			seen = append(seen, before)
			mu.Unlock()
		})
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) && s.PairCount() < n {
		time.Sleep(5 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	// Max is 5 pairs, so history stops growing after n=5; what matters is
	// that every task saw a consistent, monotonically increasing count.
	for i, got := range seen {
		if got != i {
			t.Errorf("task %d observed PairCount=%d, want %d (no task saw another's partial state)", i+1, got, i)
		}
	}
	if s.PairCount() != n {
		t.Errorf("final PairCount = %d, want %d", s.PairCount(), n)
	}
	_ = m
}

// T-1.4: RunSerial must be safe and return false before start and after stop.
func TestRunSerialLifecycleStates(t *testing.T) {
	m := NewManager("p", 5)

	// Idle: worker never started.
	idle := m.Get("private:idle")
	if idle.RunSerial(func(context.Context) {}) {
		t.Error("RunSerial on a session with no worker must return false")
	}
	// Must not panic and must still be false after Stop.
	idle.Stop()
	if idle.RunSerial(func(context.Context) {}) {
		t.Error("RunSerial after Stop must return false")
	}

	// Running then Stopped.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := m.Get("private:live")
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)
	if !s.RunSerial(func(context.Context) {}) {
		t.Error("RunSerial on a running session must return true")
	}
	s.Stop()
	if s.RunSerial(func(context.Context) {}) {
		t.Error("RunSerial after Stop must return false")
	}
	wg.Wait()
}

// T-1.5: concurrent RunSerial and Stop must never panic with
// "send on closed channel".
func TestRunSerialConcurrentWithStop(t *testing.T) {
	for iter := 0; iter < 50; iter++ {
		m := NewManager("p", 5)
		s := m.Get("private:race")
		ctx, cancel := context.WithCancel(context.Background())
		var wg sync.WaitGroup
		s.StartWorker(ctx, &wg)

		var senders sync.WaitGroup
		for i := 0; i < 8; i++ {
			senders.Add(1)
			go func() {
				defer senders.Done()
				for j := 0; j < 20; j++ {
					s.RunSerial(func(context.Context) {})
				}
			}()
		}
		time.Sleep(time.Millisecond)
		s.Stop()
		senders.Wait()
		cancel()
		wg.Wait()
	}
}

// T-1.6: Stop must be idempotent.
func TestStopIdempotent(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:a")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	s.Stop()
	s.Stop()
	s.Stop()
	wg.Wait()

	if s.RunSerial(func(context.Context) {}) {
		t.Error("RunSerial after repeated Stop must be false")
	}
}

// T-2.6: a full backlog rejects new tasks rather than growing unbounded.
func TestQueueFullRejects(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:flood")
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	release := make(chan struct{})
	blocked := make(chan struct{}, 1)
	// Occupy the worker with a task that will not finish yet.
	s.RunSerial(func(context.Context) {
		blocked <- struct{}{}
		<-release
	})
	<-blocked // worker is now busy

	accepted := 0
	for i := 0; i < SerialQueueCap*3; i++ {
		if s.RunSerial(func(context.Context) {}) {
			accepted++
		}
	}
	if accepted > SerialQueueCap {
		t.Errorf("accepted %d tasks into a queue of cap %d", accepted, SerialQueueCap)
	}
	if accepted == 0 {
		t.Error("expected at least some tasks to be accepted before the queue filled")
	}

	close(release)
	cancel()
	s.Stop()
	wg.Wait()
}

// T-2.4: a panicking task must not kill the worker or the process.
func TestTaskPanicIsolation(t *testing.T) {
	prev := OnTaskPanic
	var panics int64
	OnTaskPanic = func(any) { atomic.AddInt64(&panics, 1) }
	defer func() { OnTaskPanic = prev }()

	m := NewManager("p", 5)
	s := m.Get("private:panic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	s.RunSerial(func(context.Context) { panic("boom") })

	done := make(chan struct{})
	s.RunSerial(func(context.Context) { close(done) })

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("worker stopped running tasks after a panic")
	}
	if atomic.LoadInt64(&panics) != 1 {
		t.Errorf("OnTaskPanic called %d times, want 1", panics)
	}
	cancel()
	s.Stop()
	wg.Wait()
}

// T-2.5: cancelling the worker context stops the worker from draining
// further queued tasks, so shutdown is not held up by a backlog.
func TestWorkerContextCancelStopsDraining(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:ctx")
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	gate := make(chan struct{})
	entered := make(chan struct{}, 1)
	s.RunSerial(func(context.Context) {
		entered <- struct{}{}
		<-gate
	})
	<-entered

	var ran int64
	for i := 0; i < 10; i++ {
		s.RunSerial(func(context.Context) { atomic.AddInt64(&ran, 1) })
	}

	cancel()    // shutdown begins
	close(gate) // let the current task finish
	s.Stop()
	wg.Wait()

	if got := atomic.LoadInt64(&ran); got == 10 {
		t.Errorf("worker drained all %d queued tasks after cancellation", got)
	}
}

// T-2.1: the enqueue path must never block the caller. With a saturated
// backlog, RunSerial returns immediately instead of waiting.
func TestRunSerialNeverBlocks(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:nonblock")
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	release := make(chan struct{})
	blocked := make(chan struct{}, 1)
	s.RunSerial(func(context.Context) { blocked <- struct{}{}; <-release })
	<-blocked

	// Saturate the backlog.
	for i := 0; i < SerialQueueCap; i++ {
		s.RunSerial(func(context.Context) {})
	}

	start := time.Now()
	for i := 0; i < 1000; i++ {
		s.RunSerial(func(context.Context) {})
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("1000 rejected enqueues took %s; enqueue path is blocking", elapsed)
	}

	close(release)
	cancel()
	s.Stop()
	wg.Wait()
}

// T-1.3: distinct sessions must be able to run concurrently.
func TestDistinctSessionsRunConcurrently(t *testing.T) {
	m := NewManager("p", 5)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup

	const sessions = 4
	var concurrent, maxConcurrent int64
	var started sync.WaitGroup
	started.Add(sessions)

	for i := 0; i < sessions; i++ {
		s := m.Get(fmt.Sprintf("private:s%d", i))
		s.StartWorker(ctx, &wg)
		s.RunSerial(func(context.Context) {
			cur := atomic.AddInt64(&concurrent, 1)
			for {
				old := atomic.LoadInt64(&maxConcurrent)
				if cur <= old || atomic.CompareAndSwapInt64(&maxConcurrent, old, cur) {
					break
				}
			}
			started.Done()
			started.Wait() // hold until every session is inside its task
			atomic.AddInt64(&concurrent, -1)
		})
	}

	waitDone := make(chan struct{})
	go func() { started.Wait(); close(waitDone) }()
	select {
	case <-waitDone:
	case <-time.After(3 * time.Second):
		t.Fatal("sessions did not run concurrently; workers appear serialised globally")
	}

	cancel()
	for _, name := range m.Names() {
		m.Get(name).Stop()
	}
	wg.Wait()
}

// T-2.5: Stop must not block for the whole backlog.
func TestStopIsBounded(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:bounded")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	s.StartWorker(ctx, &wg)

	release := make(chan struct{})
	entered := make(chan struct{}, 1)
	s.RunSerial(func(context.Context) { entered <- struct{}{}; <-release })
	<-entered
	for i := 0; i < SerialQueueCap; i++ {
		s.RunSerial(func(context.Context) { time.Sleep(10 * time.Millisecond) })
	}

	start := time.Now()
	s.Stop()
	elapsed := time.Since(start)
	close(release)
	wg.Wait()

	if elapsed > SerialDrainTimeout+2*time.Second {
		t.Errorf("Stop took %s, want <= %s", elapsed, SerialDrainTimeout+2*time.Second)
	}
}

// A worker goroutine must not leak after Stop.
func TestWorkerGoroutineExits(t *testing.T) {
	before := runtime.NumGoroutine()
	for i := 0; i < 20; i++ {
		m := NewManager("p", 5)
		s := m.Get("private:g")
		ctx, cancel := context.WithCancel(context.Background())
		var wg sync.WaitGroup
		s.StartWorker(ctx, &wg)
		s.RunSerial(func(context.Context) {})
		s.Stop()
		cancel()
		wg.Wait()
	}
	time.Sleep(100 * time.Millisecond)
	runtime.GC()
	after := runtime.NumGoroutine()
	if after > before+5 {
		t.Errorf("goroutines grew from %d to %d; workers appear to leak", before, after)
	}
}

var _ = providers.ChatMessage{}
