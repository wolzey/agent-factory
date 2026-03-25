package wizard

import (
	"os/user"

	"github.com/charmbracelet/huh"
	"github.com/wolzey/agent-factory/cli/internal/config"
)

type colorOption struct {
	Name string
	Hex  string
}

type styleOption struct {
	Name  string
	Index int
}

var colors = []colorOption{
	{"Blue", "#4a90d9"},
	{"Red", "#ff6b6b"},
	{"Green", "#51cf66"},
	{"Yellow", "#ffd43b"},
}

var styles = []styleOption{
	{"Engineer", 0},
	{"Hacker", 1},
	{"Designer", 2},
	{"Manager", 3},
}

func Run() (config.UserConfig, error) {
	var (
		username    string
		serverMode  string
		serverURL   string
		colorChoice string
		styleChoice int
	)

	// Default username
	defaultUser := "anonymous"
	if u, err := user.Current(); err == nil {
		defaultUser = u.Username
	}
	username = defaultUser

	// Color select options
	colorOptions := make([]huh.Option[string], len(colors))
	for i, c := range colors {
		colorOptions[i] = huh.NewOption(c.Name+" ("+c.Hex+")", c.Hex)
	}

	// Style select options
	styleOptions := make([]huh.Option[int], len(styles))
	for i, s := range styles {
		styleOptions[i] = huh.NewOption(s.Name, s.Index)
	}

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

		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Pick your avatar color").
				Options(colorOptions...).
				Value(&colorChoice),
		),

		huh.NewGroup(
			huh.NewSelect[int]().
				Title("Pick your character style").
				Options(styleOptions...).
				Value(&styleChoice),
		),
	)

	if err := form.Run(); err != nil {
		return config.UserConfig{}, err
	}

	if serverMode == "local" || serverURL == "" {
		serverURL = "http://localhost:4242"
	}

	return config.UserConfig{
		Username:  username,
		ServerURL: serverURL,
		Avatar: config.AvatarConfig{
			SpriteIndex: styleChoice,
			Color:       colorChoice,
			Hat:         nil,
			Trail:       nil,
		},
	}, nil
}
