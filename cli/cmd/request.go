package cmd

import (
	"bytes"
	"context"
	"net/http"

	"github.com/wolzey/agent-factory/cli/internal/identity"
)

func newAuthenticatedJSONRequest(
	ctx context.Context,
	method string,
	url string,
	payload []byte,
) (*http.Request, error) {
	device, err := identity.LoadOrCreate()
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+device.Secret)
	return request, nil
}
