package console

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/sirupsen/logrus"
)

// Formatter returns the logrus formatter for the terminal:
//
//	14:32:05  INFO   provider: openaicompat, model=deepseek-chat
//
// The timestamp is dim, the level fills a fixed five-column coloured field,
// and the message keeps the terminal's default colour. Where colour would be
// wrong (redirected output, NO_COLOR, a redirected stderr) it falls back to
// logrus' own text format, which never emits ANSI escapes.
func Formatter() logrus.Formatter {
	if !coloursOnStderr() {
		return &logrus.TextFormatter{DisableColors: true}
	}
	return consoleFormatter{coloured: true}
}

// coloursOnStderr requires both streams to be terminals: logrus writes to
// stderr, so colouring it while the caller redirected stdout would still put
// escape sequences into a merged log file.
func coloursOnStderr() bool {
	if noColor() {
		return false
	}
	return TTY() && isCharDevice(os.Stderr)
}

type consoleFormatter struct{ coloured bool }

// Format implements logrus.Formatter. Fields are appended as dim key=value
// pairs, the way logrus' own text formatter appends them.
func (f consoleFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	var b strings.Builder
	b.WriteString(paint(entry.Time.Format("15:04:05"), darkGray, f.coloured))
	b.WriteString("  ")
	level := levelLabel(entry.Level)
	b.WriteString(paint(level, levelColour(entry.Level), f.coloured))
	if pad := 5 - len(level); pad > 0 {
		b.WriteString(strings.Repeat(" ", pad))
	}
	b.WriteString("  ")
	b.WriteString(entry.Message)

	if len(entry.Data) > 0 {
		keys := make([]string, 0, len(entry.Data))
		for k := range entry.Data {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			b.WriteByte(' ')
			b.WriteString(paint(fmt.Sprintf("%s=%v", k, entry.Data[k]), darkGray, f.coloured))
		}
	}

	b.WriteByte('\n')
	return []byte(b.String()), nil
}

// levelLabel spells out logrus' level names in the five-column form the
// design asks for. logrus renders WarnLevel as "warning", hence the switch.
func levelLabel(level logrus.Level) string {
	switch level {
	case logrus.TraceLevel:
		return "TRACE"
	case logrus.DebugLevel:
		return "DEBUG"
	case logrus.InfoLevel:
		return "INFO"
	case logrus.WarnLevel:
		return "WARN"
	case logrus.ErrorLevel:
		return "ERROR"
	case logrus.FatalLevel:
		return "FATAL"
	case logrus.PanicLevel:
		return "PANIC"
	}
	return strings.ToUpper(level.String())
}

func levelColour(level logrus.Level) rgb {
	switch level {
	case logrus.WarnLevel:
		return amber
	case logrus.ErrorLevel, logrus.FatalLevel, logrus.PanicLevel:
		return red
	case logrus.InfoLevel:
		return mint
	default:
		return darkGray
	}
}
