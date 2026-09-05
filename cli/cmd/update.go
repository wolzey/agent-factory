package cmd

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

const (
	repo         = "wolzey/agent-factory"
	releasesAPI  = "https://api.github.com/repos/" + repo + "/releases/latest"
	downloadBase = "https://github.com/" + repo + "/releases/download"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update Agent Factory CLI to the latest version",
	RunE:  runUpdate,
}

type ghRelease struct {
	TagName string `json:"tag_name"`
}

func runUpdate(cmd *cobra.Command, args []string) error {
	ui.PrintBanner()

	// Fetch latest release tag
	ui.Info("Checking for updates...")
	fmt.Println()

	resp, err := http.Get(releasesAPI)
	if err != nil {
		ui.Error("Failed to check for updates: " + err.Error())
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		ui.Error(fmt.Sprintf("GitHub API returned %d", resp.StatusCode))
		return fmt.Errorf("github API error: %d", resp.StatusCode)
	}

	var release ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		ui.Error("Failed to parse release info: " + err.Error())
		return err
	}

	fmt.Printf("  Latest version: %s\n", ui.CyanStyle.Render(release.TagName))

	// Determine platform asset name
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	asset := fmt.Sprintf("agent-factory_%s_%s.tar.gz", goos, goarch)
	downloadURL := fmt.Sprintf("%s/%s/%s", downloadBase, release.TagName, asset)

	fmt.Printf("  Platform:       %s/%s\n", goos, goarch)
	fmt.Println()

	// Download
	ui.Info("Downloading " + asset + "...")

	dlResp, err := http.Get(downloadURL)
	if err != nil {
		ui.Error("Download failed: " + err.Error())
		return err
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != 200 {
		ui.Error(fmt.Sprintf("Download returned %d — is %s available for your platform?", dlResp.StatusCode, release.TagName))
		return fmt.Errorf("download error: %d", dlResp.StatusCode)
	}

	// Extract the binary from the tarball
	binary, err := extractBinaryFromTarGz(dlResp.Body, "agent-factory")
	if err != nil {
		ui.Error("Failed to extract binary: " + err.Error())
		return err
	}

	// Find current binary path
	execPath, err := os.Executable()
	if err != nil {
		ui.Error("Cannot determine current binary path: " + err.Error())
		return err
	}

	// Resolve symlinks
	resolvedPath, err := resolveSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}

	// Replace the directory entry, never overwrite the running executable.
	ui.Info("Installing to " + resolvedPath + "...")

	if err := replaceBinary(resolvedPath, binary); err != nil {
		ui.Error("Failed to write binary: " + err.Error())
		ui.Info("You may need to run with sudo or check file permissions.")
		return err
	}

	fmt.Println()
	ui.Success(fmt.Sprintf("Updated to %s!", release.TagName))

	// Run the newly installed binary so refreshed hooks and skills come from the
	// new release rather than this still-running executable's embedded assets.
	refresh := exec.Command(resolvedPath, "_refresh-assets")
	if output, err := refresh.CombinedOutput(); err != nil {
		ui.Warn("CLI updated, but installed hooks could not be refreshed: " + err.Error())
		if message := strings.TrimSpace(string(output)); message != "" {
			ui.Info(message)
		}
		ui.Info("Run 'agent-factory install' to refresh hooks manually.")
	} else {
		ui.Success("Installed hooks and identity refreshed")
	}

	fmt.Println()
	return nil
}

func extractBinaryFromTarGz(r io.Reader, name string) ([]byte, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("gzip error: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("tar error: %w", err)
		}

		// Match the binary name (may be in a subdirectory)
		if header.Typeflag == tar.TypeReg && strings.HasSuffix(header.Name, name) {
			data, err := io.ReadAll(tr)
			if err != nil {
				return nil, fmt.Errorf("read error: %w", err)
			}
			return data, nil
		}
	}

	return nil, fmt.Errorf("binary %q not found in archive", name)
}

// replaceBinary stages a fresh inode beside the executable, then atomically
// renames it into place. In-place writes can leave macOS's cached code signature
// stale (SIGKILL on launch) and fail with ETXTBSY on Linux for a running binary.
func replaceBinary(path string, binary []byte) error {
	staged, err := os.CreateTemp(filepath.Dir(path), ".agent-factory-update-*")
	if err != nil {
		return fmt.Errorf("stage executable: %w", err)
	}
	defer os.Remove(staged.Name())
	defer staged.Close()

	if _, err := staged.Write(binary); err != nil {
		return fmt.Errorf("write staged executable: %w", err)
	}
	if err := staged.Chmod(0o755); err != nil {
		return fmt.Errorf("set executable permissions: %w", err)
	}
	if err := staged.Sync(); err != nil {
		return fmt.Errorf("sync staged executable: %w", err)
	}
	if err := staged.Close(); err != nil {
		return fmt.Errorf("close staged executable: %w", err)
	}
	if err := os.Rename(staged.Name(), path); err != nil {
		return fmt.Errorf("replace executable: %w", err)
	}
	return nil
}

func resolveSymlinks(path string) (string, error) {
	return filepath.EvalSymlinks(path)
}
