# Update Agent Factory Status

Summarize what you are currently working on in a single short sentence (max 80 characters). This will be displayed in the Agent Factory visualization so teammates can see what you're doing.

Read the Agent Factory config and installation identity:

```bash
USERNAME=$(jq -r '.username // "anonymous"' ~/.config/agent-factory/config.json 2>/dev/null || echo "anonymous")
SERVER_URL=$(jq -r '.serverUrl // "http://localhost:4242"' ~/.config/agent-factory/config.json 2>/dev/null || echo "http://localhost:4242")
DEVICE_SECRET=$(jq -r 'select(.version == 1) | .secret // empty' ~/.config/agent-factory/identity.json 2>/dev/null)
```

If `DEVICE_SECRET` is empty, ask the user to rerun `agent-factory install` before continuing.

Then POST your summary to the Agent Factory server. Replace `<SUMMARY>` with your one-line task summary:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEVICE_SECRET}" \
  -d "{\"username\": \"$USERNAME\", \"summary\": \"<SUMMARY>\"}" \
  "${SERVER_URL}/api/context" \
  --connect-timeout 1 --max-time 2
```

Confirm to the user that the status was updated.
