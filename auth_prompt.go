package main

// `SorarinBot -set-password` writes an admin.password_hash into config.yaml.
//
// The password is read from standard input and therefore echoes in the
// terminal. That is a deliberate trade: reading it without echo needs either a
// new dependency or per-platform terminal handling, and this command is meant
// to be run once, from a console the operator controls.

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"unicode"
	"unicode/utf8"

	"SorarinBot/core/config"
)

const minPasswordLength = 8

// cleanPassword normalises what arrived on stdin and refuses anything that
// could not have been typed at a prompt.
//
// Reading a line is not as simple as it looks. A shell can prefix the bytes it
// pipes in — Windows PowerShell 5.1 writes a UTF-8 BOM, for instance — and the
// hash would then be taken over something the operator never typed, leaving
// them locked out with nothing but "密码错误" to go on. NUL bytes and a leading
// byte order mark are therefore dropped, and anything still non-printable is
// reported rather than stored.
func cleanPassword(raw string) (string, error) {
	cleaned := strings.ReplaceAll(raw, "\x00", "")
	cleaned = strings.TrimPrefix(cleaned, "\ufeff")
	cleaned = strings.TrimRight(cleaned, "\r\n")
	if cleaned == "" {
		return "", nil
	}
	if !utf8.ValidString(cleaned) {
		return "", fmt.Errorf("the password is not valid UTF-8; " +
			"if you piped it in, check the encoding your shell used")
	}
	for _, r := range cleaned {
		if !unicode.IsPrint(r) {
			return "", fmt.Errorf("the password contains a non-printable character (U+%04X); "+
				"type it at the prompt instead of piping it in", r)
		}
	}
	return cleaned, nil
}

func runSetPassword() error {
	fmt.Print("New dashboard password (leave empty to disable authentication): ")

	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return fmt.Errorf("read password: %w", err)
	}

	password, err := cleanPassword(line)
	if err != nil {
		return err
	}

	next := config.Snapshot()

	if password == "" {
		next.Admin.PasswordHash = ""
		config.Apply(next)
		if err := config.Save(); err != nil {
			return err
		}
		fmt.Println("Authentication disabled. The dashboard is open to anyone who can reach the port.")
		return nil
	}

	if len([]rune(password)) < minPasswordLength {
		return fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}

	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	next.Admin.PasswordHash = hash
	config.Apply(next)
	if err := config.Save(); err != nil {
		return err
	}

	fmt.Println("Password stored in config.yaml. Restart SorarinBot for it to take effect.")
	return nil
}
