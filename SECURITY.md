# Security Policy

BrainBar is a local-first macOS app. It opens local files, runs user-configured local commands, and embeds local Graphify output. It should not upload vault contents or require cloud services.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory when available, or by contacting the maintainer through the GitHub repository.

Do not publish proof-of-concept details publicly until there has been time to investigate and release a fix.

## Scope

Security-sensitive areas include:

- command execution through configured local commands
- path resolution for vault files
- WebKit message bridges
- installer and updater scripts
- release packaging and signing
- handling of local config files

## Public-Safety Expectations

Please do not include any of the following in issues, pull requests, screenshots, or examples:

- private vault contents
- local vault paths
- tokens, secrets, API keys, or credentials
- personal workflow scripts that reveal private data
- generated graph files from a private vault

Use minimal synthetic examples instead.

## Supported Versions

Security fixes are targeted at the latest released version of BrainBar.

## Local-First Design

BrainBar intentionally keeps integrations local and configurable. Any change that introduces network access, telemetry, automatic mutation of vault content, or provider-specific behavior should be discussed before implementation.
