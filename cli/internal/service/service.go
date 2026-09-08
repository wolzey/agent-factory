// Package service installs the heartbeat reporter as a per-user background
// service, so a machine keeps reporting its sessions without a terminal held
// open for it.
package service

import (
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Label is the launchd label / systemd unit name of the heartbeat service.
const Label = "com.agentfactory.heartbeat"

// Path returns where the service definition for this OS is written.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "LaunchAgents", Label+".plist"), nil
	case "linux":
		return filepath.Join(home, ".config", "systemd", "user", "agent-factory-heartbeat.service"), nil
	default:
		return "", fmt.Errorf("no background service for %s -- run 'agent-factory heartbeat' yourself", runtime.GOOS)
	}
}

// Installed reports whether a service definition exists for this OS.
func Installed() bool {
	path, err := Path()
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

// Install writes the service definition and starts it, replacing any previous
// one so a reinstall picks up a new binary path or interval.
func Install(binaryPath string, interval time.Duration, logDir string) (string, error) {
	path, err := Path()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return "", err
	}

	definition := ""
	switch runtime.GOOS {
	case "darwin":
		definition = plist(binaryPath, interval, logDir)
	case "linux":
		definition = systemdUnit(binaryPath, interval)
	}
	if err := os.WriteFile(path, []byte(definition), 0o644); err != nil {
		return "", err
	}

	// Tearing the old one down first is what makes reinstall idempotent.
	if err := stop(path); err != nil {
		return path, err
	}
	return path, start(path)
}

// Uninstall stops the service and removes its definition. Removing something
// that was never installed is not an error.
func Uninstall() (string, error) {
	path, err := Path()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return path, nil
	}

	// The definition stays on disk if the running service could not be stopped:
	// removing it would report success while a loaded service keeps relaunching
	// a reporter whose configuration is about to be deleted.
	if err := stop(path); err != nil {
		return path, err
	}
	if err := os.Remove(path); err != nil {
		return path, err
	}
	if runtime.GOOS == "linux" {
		_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	}
	return path, nil
}

func start(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("launchctl", "bootstrap", guiDomain(), path).Run()
	case "linux":
		if err := exec.Command("systemctl", "--user", "daemon-reload").Run(); err != nil {
			return err
		}
		return exec.Command("systemctl", "--user", "enable", "--now", filepath.Base(path)).Run()
	}
	return nil
}

// stop tears the service down. Being asked to stop something that was never
// loaded is the normal case on a first install, and is not an error; anything
// else is, because the caller is about to delete what the service needs.
func stop(path string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("launchctl", "bootout", guiDomain()+"/"+Label)
	case "linux":
		command = exec.Command("systemctl", "--user", "disable", "--now", filepath.Base(path))
	default:
		return nil
	}

	output, err := command.CombinedOutput()
	if err == nil || notLoaded(string(output)) {
		return nil
	}
	return fmt.Errorf("could not stop %s: %s", Label, strings.TrimSpace(string(output)))
}

func notLoaded(output string) bool {
	lowered := strings.ToLower(output)
	for _, phrase := range []string{"no such process", "not loaded", "could not find", "not find specified service", "does not exist", "no such file"} {
		if strings.Contains(lowered, phrase) {
			return true
		}
	}
	return false
}

func guiDomain() string {
	return "gui/" + strconv.Itoa(os.Getuid())
}

// xmlText escapes a value for a plist <string>. A home directory containing "&"
// would otherwise produce a plist launchd refuses to load.
func xmlText(value string) string {
	var escaped strings.Builder
	if err := xml.EscapeText(&escaped, []byte(value)); err != nil {
		return ""
	}
	return escaped.String()
}

func plist(binaryPath string, interval time.Duration, logDir string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
    <string>heartbeat</string>
    <string>--interval</string>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>%s</string>
  <key>StandardErrorPath</key>
  <string>%s</string>
</dict>
</plist>
`, Label, xmlText(binaryPath), xmlText(interval.String()),
		xmlText(filepath.Join(logDir, "heartbeat.log")),
		xmlText(filepath.Join(logDir, "heartbeat.error.log")))
}

func systemdUnit(binaryPath string, interval time.Duration) string {
	// The binary path is quoted: an installation under a home directory with a
	// space in it is a valid path systemd would otherwise split into arguments.
	return fmt.Sprintf(`[Unit]
Description=Agent Factory session heartbeat

[Service]
ExecStart="%s" heartbeat --interval %s
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`, strings.ReplaceAll(binaryPath, `"`, `\"`), interval.String())
}
