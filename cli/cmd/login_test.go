package cmd

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testDeviceSecret = "afd1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func TestRequestLoginHandoffAuthenticatesWithoutPuttingSecretInBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if got := request.Header.Get("Authorization"); got != "Bearer "+testDeviceSecret {
			t.Errorf("authorization header was not populated")
		}
		var body map[string]string
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["username"] != "alice" {
			t.Errorf("username = %q, want alice", body["username"])
		}
		for _, value := range body {
			if strings.Contains(value, testDeviceSecret) {
				t.Error("device credential leaked into request body")
			}
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"code":"one-time-code","expiresIn":60}`))
	}))
	defer server.Close()

	result, err := requestLoginHandoff(context.Background(), server.Client(), server.URL, "alice", testDeviceSecret)
	if err != nil {
		t.Fatal(err)
	}
	if result.Code != "one-time-code" || result.ExpiresIn != 60 {
		t.Fatalf("handoff = %#v", result)
	}
}

func TestBuildLoginURLUsesFragmentAndTrimsSlash(t *testing.T) {
	got := buildLoginURL("https://factory.example/", "a+b")
	if got != "https://factory.example/#handoff=a%2Bb" {
		t.Fatalf("buildLoginURL() = %q", got)
	}
}

func TestRequestLoginHandoffReturnsServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusUnauthorized)
		_, _ = response.Write([]byte(`{"error":"invalid installation"}`))
	}))
	defer server.Close()

	_, err := requestLoginHandoff(context.Background(), server.Client(), server.URL, "alice", testDeviceSecret)
	if err == nil || !strings.Contains(err.Error(), "invalid installation") {
		t.Fatalf("error = %v", err)
	}
}
