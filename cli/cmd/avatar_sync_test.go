package cmd

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wolzey/agent-factory/cli/internal/config"
)

func TestAvatarSyncPreservesDesignerFields(t *testing.T) {
	hair, glasses, flower, beard, mouth, shirt := 2, 1, 6, 4, 1, 9
	hairColor, skin, pants, shoes := "#604332", "#ae704e", "#2b3440", "#555555"
	avatar := config.AvatarConfig{SpriteIndex: hair, Color: "#5f8f78", HairStyle: &hair, HairColor: &hairColor, SkinTone: &skin, PantsColor: &pants, ShoeColor: &shoes, FaceAccessory: &glasses, HeadAccessory: &flower, FacialHair: &beard, MouthStyle: &mouth, ShirtDesign: &shirt}
	methods := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.Method)
		if r.URL.Path != "/api/avatar/installation" || r.Header.Get("Authorization") != "Bearer fixture-only" {
			t.Error("incorrect authenticated avatar request")
		}
		if r.Method == http.MethodPut {
			var body struct {
				Avatar config.AvatarConfig `json:"avatar"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			want, _ := json.Marshal(avatar)
			got, _ := json.Marshal(body.Avatar)
			if string(want) != string(got) {
				t.Error("designer choices changed during save")
			}
		}
		_ = json.NewEncoder(w).Encode(avatarProfile{Avatar: avatar, Saved: true, Revision: "revision-1"})
	}))
	defer server.Close()
	current, err := syncAvatar(context.Background(), server.Client(), server.URL, "fixture-only", nil)
	if err != nil || !current.Saved || *current.Avatar.HairStyle != hair {
		t.Fatalf("load failed: %v", err)
	}
	if _, err := syncAvatar(context.Background(), server.Client(), server.URL, "fixture-only", &avatar, "revision-1"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(methods, ",") != "GET,PUT" {
		t.Fatal(methods)
	}
}

func TestAvatarSyncRejectsInsecureServersAndRedirects(t *testing.T) {
	if _, err := syncAvatar(context.Background(), http.DefaultClient, "http://factory.example", "fixture-only", nil); err == nil {
		t.Fatal("accepted remote HTTP")
	}
	forwarded := false
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded = true }))
	defer other.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	if _, err := syncAvatar(context.Background(), source.Client(), source.URL, "fixture-only", nil); err == nil {
		t.Fatal("accepted redirect")
	}
	if forwarded {
		t.Fatal("forwarded installation request")
	}
}

func TestAvatarSyncReportsOfflineOrOlderServerWithoutClaimingASave(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusServiceUnavailable} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
		_, err := syncAvatar(context.Background(), server.Client(), server.URL, "fixture-only", &config.AvatarConfig{Color: "#5f8f78"})
		server.Close()
		if err == nil {
			t.Fatal("reported an unsuccessful save as successful")
		}
		if strings.Contains(err.Error(), "fixture-only") {
			t.Fatal("included credential in error")
		}
	}
}
