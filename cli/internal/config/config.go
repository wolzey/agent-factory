package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type AvatarConfig struct {
	SpriteIndex   int     `json:"spriteIndex"`
	Color         string  `json:"color"`
	Hat           *string `json:"hat"`
	Trail         *string `json:"trail"`
	HairStyle     *int    `json:"hairStyle,omitempty"`
	HairColor     *string `json:"hairColor,omitempty"`
	SkinTone      *string `json:"skinTone,omitempty"`
	ShirtColor    *string `json:"shirtColor,omitempty"`
	PantsColor    *string `json:"pantsColor,omitempty"`
	ShoeColor     *string `json:"shoeColor,omitempty"`
	FacialHair    *int    `json:"facialHair,omitempty"`
	MouthStyle    *int    `json:"mouthStyle,omitempty"`
	FaceAccessory *int    `json:"faceAccessory,omitempty"`
	HeadAccessory *int    `json:"headAccessory,omitempty"`
	ShirtDesign   *int    `json:"shirtDesign,omitempty"`
}

type RepositoryConfig struct {
	Username  *string       `json:"username,omitempty"`
	ServerURL *string       `json:"serverUrl,omitempty"`
	Avatar    *AvatarConfig `json:"avatar,omitempty"`
	Token     *string       `json:"token,omitempty"`
}

type UserConfig struct {
	Username     string                      `json:"username"`
	ServerURL    string                      `json:"serverUrl"`
	Avatar       AvatarConfig                `json:"avatar"`
	Token        string                      `json:"token,omitempty"`
	Repositories map[string]RepositoryConfig `json:"repositories,omitempty"`
}

func ConfigDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "agent-factory")
}

func ConfigPath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

func Exists() bool {
	_, err := os.Stat(ConfigPath())
	return err == nil
}

func Write(cfg UserConfig) error {
	cfg.ServerURL = strings.TrimRight(cfg.ServerURL, "/")
	for path, override := range cfg.Repositories {
		if override.ServerURL != nil {
			serverURL := strings.TrimRight(*override.ServerURL, "/")
			override.ServerURL = &serverURL
			cfg.Repositories[path] = override
		}
	}

	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	return os.WriteFile(ConfigPath(), data, 0o644)
}

func Read() (UserConfig, error) {
	return ReadBase()
}

func ReadForCurrentPath() (UserConfig, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return UserConfig{}, err
	}
	return ReadForPath(cwd)
}

func ReadBase() (UserConfig, error) {
	var cfg UserConfig
	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

func ReadForPath(path string) (UserConfig, error) {
	cfg, err := ReadBase()
	if err != nil {
		return cfg, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return cfg, err
	}
	return resolveForPath(cfg, path, home), nil
}

func WriteToken(token string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	return WriteTokenForPath(cwd, token)
}

func WriteTokenForPath(path, token string) error {
	cfg, err := ReadBase()
	if err != nil {
		return err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	matches := matchingRepositories(cfg.Repositories, path, home)
	if len(matches) == 0 {
		cfg.Token = token
	} else {
		key := matches[len(matches)-1].key
		override := cfg.Repositories[key]
		override.Token = &token
		cfg.Repositories[key] = override
	}
	return Write(cfg)
}

type repositoryMatch struct {
	key  string
	path string
}

func resolveForPath(cfg UserConfig, path, home string) UserConfig {
	cfg.ServerURL = strings.TrimRight(cfg.ServerURL, "/")
	for _, match := range matchingRepositories(cfg.Repositories, path, home) {
		override := cfg.Repositories[match.key]
		identityChanged := false
		if override.Username != nil {
			identityChanged = identityChanged || cfg.Username != *override.Username
			cfg.Username = *override.Username
		}
		if override.ServerURL != nil {
			serverURL := strings.TrimRight(*override.ServerURL, "/")
			identityChanged = identityChanged || cfg.ServerURL != serverURL
			cfg.ServerURL = serverURL
		}
		if override.Avatar != nil {
			cfg.Avatar = *override.Avatar
		}
		if override.Token != nil {
			cfg.Token = *override.Token
		} else if identityChanged {
			cfg.Token = ""
		}
	}
	cfg.ServerURL = strings.TrimRight(cfg.ServerURL, "/")
	return cfg
}

func matchingRepositories(repositories map[string]RepositoryConfig, path, home string) []repositoryMatch {
	target := expandPath(path, home)
	if !filepath.IsAbs(target) {
		absoluteTarget, err := filepath.Abs(target)
		if err != nil {
			return nil
		}
		target = absoluteTarget
	}
	target = filepath.Clean(target)

	matches := make([]repositoryMatch, 0)
	for key := range repositories {
		repositoryPath := expandPath(key, home)
		if !filepath.IsAbs(repositoryPath) {
			continue
		}
		repositoryPath = filepath.Clean(repositoryPath)
		if isPathWithin(repositoryPath, target) {
			matches = append(matches, repositoryMatch{key: key, path: repositoryPath})
		}
	}

	sort.Slice(matches, func(i, j int) bool {
		if len(matches[i].path) == len(matches[j].path) {
			return matches[i].key < matches[j].key
		}
		return len(matches[i].path) < len(matches[j].path)
	})
	return matches
}

func expandPath(path, home string) string {
	switch {
	case path == "~":
		return home
	case strings.HasPrefix(path, "~/"):
		return filepath.Join(home, strings.TrimPrefix(path, "~/"))
	default:
		return path
	}
}

func isPathWithin(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}
