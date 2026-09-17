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

	"SorarinBot/core/config"
)

const minPasswordLength = 8

func runSetPassword() error {
	fmt.Print("New dashboard password (leave empty to disable authentication): ")

	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return fmt.Errorf("read password: %w", err)
	}
	password := strings.TrimRight(line, "\r\n")

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
