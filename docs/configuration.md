# BrainBar Configuration

BrainBar stores local configuration at:

```text
~/Library/Application Support/BrainBar/config.json
```

Development and tests can override the path with `BRAIN_BAR_CONFIG`.

```sh
BRAIN_BAR_CONFIG=/tmp/brainbar-config.json open ~/Applications/BrainBar.app
```

## Default Shape

```json
{
  "commands": {
    "brainCheck": null,
    "refreshGraph": {
      "arguments": ["update", "."],
      "executable": "graphify",
      "workingDirectory": "vault"
    }
  },
  "graphHtmlRelativePath": "graphify-out/graph.html",
  "graphReportRelativePath": "graphify-out/GRAPH_REPORT.md",
  "notificationsEnabled": false,
  "projectDashboardRelativePath": "Project Dashboard.md",
  "reviewQueue": {
    "backgroundWatcherEnabled": false,
    "isEnabled": false,
    "manualCommand": null,
    "preflightCommand": null,
    "timeoutSeconds": 10,
    "watcherIntervalSeconds": 300
  },
  "serverPort": 8765,
  "useObsidianURLScheme": false,
  "vaultPath": ""
}
```

## Command Behavior

`workingDirectory: "vault"` runs the command inside the configured vault. Commands are executed with `Process`, not through a shell.

The default refresh command expects `graphify` to be available on `PATH`. If Graphify is installed somewhere else, set `commands.refreshGraph.executable` to that executable path.

Review Queue and Brain Check are optional local command hooks. BrainBar displays their status and only runs explicit configured actions; it does not define those workflows itself.
