package wizard

import (
	"fmt"
	"os/user"

	"github.com/charmbracelet/huh"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/designer"
)

func Run() (config.UserConfig, error) {
	var (
		username   string
		serverMode string
		serverURL  string
	)

	// Default username
	defaultUser := "anonymous"
	if u, err := user.Current(); err == nil {
		defaultUser = u.Username
	}
	username = defaultUser

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("What's your display name?").
				Value(&username).
				Placeholder(defaultUser),
		),

		huh.NewGroup(
			huh.NewSelect[string]().
				Title("How are you connecting?").
				Options(
					huh.NewOption("Local server (I'm running it myself)", "local"),
					huh.NewOption("Team server (someone shared a URL with me)", "remote"),
				).
				Value(&serverMode),
		),

		huh.NewGroup(
			huh.NewInput().
				Title("Enter the server URL").
				Value(&serverURL).
				Placeholder("https://your-server.example.com"),
		).WithHideFunc(func() bool {
			return serverMode != "remote"
		}),
	)

	if err := form.Run(); err != nil {
		return config.UserConfig{}, err
	}

	if serverMode == "local" || serverURL == "" {
		serverURL = "http://localhost:4242"
	}

	// Launch avatar designer
	fmt.Println()
	result, err := designer.Run(nil)
	if err != nil {
		return config.UserConfig{}, fmt.Errorf("avatar designer error: %w", err)
	}

	if result.Cancelled {
		return config.UserConfig{}, fmt.Errorf("avatar design cancelled")
	}

	return config.UserConfig{
		Username:  username,
		ServerURL: serverURL,
		Avatar:    result.Avatar,
	}, nil
}
