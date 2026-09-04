package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var loginHTTPClient = &http.Client{Timeout: 10 * time.Second}
var launchLoginURL = openBrowserURL

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Log this installation into Agent Factory in your browser",
	RunE:  runLogin,
}

type handoffResponse struct {
	Code      string `json:"code"`
	ExpiresIn int    `json:"expiresIn"`
}

func runLogin(cmd *cobra.Command, args []string) error {
	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("not installed")
	}

	cfg, err := config.ReadForCurrentPath()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}
	if err := refreshInstalledAssets(); err != nil {
		ui.Warn("Could not refresh installed hook assets: " + err.Error())
	}
	device, err := identity.LoadOrCreate()
	if err != nil {
		ui.Error("Failed to load installation identity: " + err.Error())
		return err
	}

	handoff, err := requestLoginHandoff(cmd.Context(), loginHTTPClient, cfg.ServerURL, cfg.Username, device.Secret)
	if err != nil {
		ui.Error("Could not start browser login: " + err.Error())
		return err
	}
	loginURL := buildLoginURL(cfg.ServerURL, handoff.Code)

	if err := launchLoginURL(loginURL); err != nil {
		ui.Warn("Could not open a browser automatically.")
		ui.Info("Open this one-time URL within " + fmt.Sprint(handoff.ExpiresIn) + " seconds:")
		fmt.Println(loginURL)
		return nil
	}

	ui.Success("Browser login opened. This one-time link expires in " + fmt.Sprint(handoff.ExpiresIn) + " seconds.")
	return nil
}

func requestLoginHandoff(
	ctx context.Context,
	client *http.Client,
	serverURL string,
	username string,
	deviceSecret string,
) (handoffResponse, error) {
	var result handoffResponse
	payload, err := json.Marshal(map[string]string{"username": username})
	if err != nil {
		return result, fmt.Errorf("encode login request: %w", err)
	}

	endpoint := strings.TrimRight(serverURL, "/") + "/api/auth/handoff"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return result, fmt.Errorf("create login request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+deviceSecret)

	response, err := client.Do(request)
	if err != nil {
		return result, fmt.Errorf("request failed: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		var failure struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, 16*1024)).Decode(&failure)
		if failure.Error != "" {
			return result, fmt.Errorf("server returned %d: %s", response.StatusCode, failure.Error)
		}
		return result, fmt.Errorf("server returned %d", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 16*1024)).Decode(&result); err != nil {
		return result, fmt.Errorf("decode login response: %w", err)
	}
	if result.Code == "" || result.ExpiresIn <= 0 {
		return result, fmt.Errorf("server returned an invalid login handoff")
	}
	return result, nil
}

func buildLoginURL(serverURL, code string) string {
	return strings.TrimRight(serverURL, "/") + "/#handoff=" + url.QueryEscape(code)
}

func openBrowserURL(target string) error {
	var command string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		command = "open"
	case "linux":
		command = "xdg-open"
	default:
		return fmt.Errorf("automatic browser launch is unsupported on %s", runtime.GOOS)
	}
	path, err := exec.LookPath(command)
	if err != nil {
		return err
	}
	return exec.Command(path, append(args, target)...).Start()
}
