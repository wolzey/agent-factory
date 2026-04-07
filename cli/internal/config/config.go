package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

type AvatarConfig struct {
	SpriteIndex int     `json:"spriteIndex"`
	Color       string  `json:"color"`
	Hat         *string `json:"hat"`
	Trail       *string `json:"trail"`
	HairStyle   *int    `json:"hairStyle,omitempty"`
	HairColor   *string `json:"hairColor,omitempty"`
	SkinTone    *string `json:"skinTone,omitempty"`
	ShirtColor  *string `json:"shirtColor,omitempty"`
	PantsColor  *string `json:"pantsColor,omitempty"`
	ShoeColor     *string `json:"shoeColor,omitempty"`
	FacialHair    *int    `json:"facialHair,omitempty"`
	MouthStyle    *int    `json:"mouthStyle,omitempty"`
	FaceAccessory *int    `json:"faceAccessory,omitempty"`
	HeadAccessory *int    `json:"headAccessory,omitempty"`
	ShirtDesign   *int    `json:"shirtDesign,omitempty"`
}

type UserConfig struct {
	Username  string       `json:"username"`
	ServerURL string       `json:"serverUrl"`
	Avatar    AvatarConfig `json:"avatar"`
	Token     string       `json:"token,omitempty"`
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
	var cfg UserConfig
	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}
