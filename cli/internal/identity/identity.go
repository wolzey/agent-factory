package identity

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	currentVersion = 1
	secretPrefix   = "afd1_"
	secretBytes    = 32
)

type Identity struct {
	Version int    `json:"version"`
	Secret  string `json:"secret"`
}

func Path() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "agent-factory", "identity.json")
}

func Exists() bool {
	_, err := os.Stat(Path())
	return err == nil
}

func Load() (Identity, error) {
	return load(Path())
}

func LoadOrCreate() (Identity, error) {
	path := Path()
	stored, err := load(path)
	if err == nil {
		if chmodErr := os.Chmod(path, 0o600); chmodErr != nil {
			return Identity{}, fmt.Errorf("secure installation identity: %w", chmodErr)
		}
		return stored, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return Identity{}, err
	}

	secret := make([]byte, secretBytes)
	if _, err := rand.Read(secret); err != nil {
		return Identity{}, fmt.Errorf("generate installation identity: %w", err)
	}
	created := Identity{
		Version: currentVersion,
		Secret:  secretPrefix + base64.RawURLEncoding.EncodeToString(secret),
	}
	if err := write(path, created); err != nil {
		return Identity{}, err
	}
	return created, nil
}

func Delete() error {
	err := os.Remove(Path())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func load(path string) (Identity, error) {
	var stored Identity
	data, err := os.ReadFile(path)
	if err != nil {
		return stored, err
	}
	if err := json.Unmarshal(data, &stored); err != nil {
		return stored, fmt.Errorf("parse installation identity: %w", err)
	}
	if err := validate(stored); err != nil {
		return Identity{}, err
	}
	return stored, nil
}

func validate(stored Identity) error {
	if stored.Version != currentVersion {
		return fmt.Errorf("unsupported installation identity version: %d", stored.Version)
	}
	if !strings.HasPrefix(stored.Secret, secretPrefix) {
		return errors.New("invalid installation identity secret")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(stored.Secret, secretPrefix))
	if err != nil || len(decoded) != secretBytes {
		return errors.New("invalid installation identity secret")
	}
	return nil
}

func write(path string, value Identity) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create identity directory: %w", err)
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode installation identity: %w", err)
	}
	data = append(data, '\n')

	temp, err := os.CreateTemp(filepath.Dir(path), ".identity-*")
	if err != nil {
		return fmt.Errorf("create temporary identity: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)

	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return fmt.Errorf("secure temporary identity: %w", err)
	}
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return fmt.Errorf("write temporary identity: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temporary identity: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("save installation identity: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("secure installation identity: %w", err)
	}
	return nil
}
