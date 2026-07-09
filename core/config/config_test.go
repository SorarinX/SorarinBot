package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := defaultConfig()
	if cfg.Web.Listen != "localhost:8080" {
		t.Errorf("Web.Listen = %q, want localhost:8080", cfg.Web.Listen)
	}
	if cfg.Chat.MaxContext != 3 {
		t.Errorf("Chat.MaxContext = %d, want 3", cfg.Chat.MaxContext)
	}
	if cfg.Chat.ImageTTL != 300 {
		t.Errorf("Chat.ImageTTL = %d, want 300", cfg.Chat.ImageTTL)
	}
	if cfg.Provider.Name != "openaicompat" {
		t.Errorf("Provider.Name = %q, want openaicompat", cfg.Provider.Name)
	}
}

func TestSnapshotReturnsCopy(t *testing.T) {
	cfg := Snapshot()
	cfg.Provider.Name = "changed"
	original := Snapshot()
	if original.Provider.Name == "changed" {
		t.Error("Snapshot should return a copy, not a reference")
	}
}

func TestApply(t *testing.T) {
	old := Snapshot()
	newCfg := old
	newCfg.Prompt = "new prompt"
	Apply(newCfg)

	if Snapshot().Prompt != "new prompt" {
		t.Errorf("Prompt = %q, want %q", Snapshot().Prompt, "new prompt")
	}

	// Restore
	Apply(old)
}

func TestLoadNonExistent(t *testing.T) {
	oldPath := Path
	Path = filepath.Join(t.TempDir(), "nonexistent.yaml")
	defer func() { Path = oldPath }()

	err := Load()
	if err != nil {
		t.Errorf("Load() error = %v, want nil (should use defaults)", err)
	}
}

func TestLoadInvalidYAML(t *testing.T) {
	oldPath := Path
	tmp := filepath.Join(t.TempDir(), "bad.yaml")
	os.WriteFile(tmp, []byte("not: [valid: yaml"), 0644)
	Path = tmp
	defer func() { Path = oldPath }()

	err := Load()
	if err == nil {
		t.Error("Load() should return error for invalid YAML")
	}
}

func TestLoadValidYAML(t *testing.T) {
	oldPath := Path
	oldCfg := Snapshot()
	defer func() {
		Path = oldPath
		Apply(oldCfg)
	}()

	tmp := filepath.Join(t.TempDir(), "test.yaml")
	content := "prompt: test prompt\nprovider:\n  name: deepseek\n  model: deepseek-chat\n"
	os.WriteFile(tmp, []byte(content), 0644)
	Path = tmp

	if err := Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if Cfg.Prompt != "test prompt" {
		t.Errorf("Prompt = %q, want %q", Cfg.Prompt, "test prompt")
	}
	if Cfg.Provider.Name != "deepseek" {
		t.Errorf("Provider.Name = %q, want %q", Cfg.Provider.Name, "deepseek")
	}
}

func TestSave(t *testing.T) {
	oldPath := Path
	oldCfg := Snapshot()
	defer func() {
		Path = oldPath
		Apply(oldCfg)
	}()

	tmp := filepath.Join(t.TempDir(), "save_test.yaml")
	Path = tmp

	testCfg := Snapshot()
	testCfg.Prompt = "saved prompt"
	Apply(testCfg)

	if err := Save(); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(tmp); os.IsNotExist(err) {
		t.Fatal("Save() did not create file")
	}

	// Reload and verify
	Apply(oldCfg)
	if err := Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if Cfg.Prompt != "saved prompt" {
		t.Errorf("Prompt = %q, want %q", Cfg.Prompt, "saved prompt")
	}
}
