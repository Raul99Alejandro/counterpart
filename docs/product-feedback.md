# Product feedback

## Alexa+ MCP Toolkit

**What worked:** The design around a standard MCP server is the right call. We could build and test everything with ordinary MCP tooling, and the functional requirements are concrete and useful: every listed tool must work, descriptions should carry synonyms, results should return stable identifiers, and errors go through `isError`. Support for MCP Apps and for account linking with any OAuth 2.1 provider covers what a real business add-on needs.

**What needs improvement:** Access. The CLI lives in a private registry, the Toolkit is US-only, and the setup guide doesn't support Windows. For a hackathon, that meant the one part of the track we could not touch was Alexa+ itself. A public sandbox or a hosted simulator would change that.

**Onboarding:** The quickstart reads well, but the first command fails for anyone outside the allowlist, with nothing explaining why.

## MCP TypeScript SDK v2

**What worked:** Standard Schema support (zod v4 objects), output schemas that skip validation on `isError`, tool annotations, and an in-memory transport that makes integration tests fast. Stateful Streamable HTTP with per-session servers fit a multi-tenant design with no workarounds.

**What needs improvement:** Examples for custom request headers on the client and for `allowedHosts` on the server (see the friction log).

## MCP Apps (ext-apps 2.0)

**What worked:** Linking a tool to its UI with `_meta.ui.resourceUri` keeps the text reply and the visual reply in one tool, which is exactly right for voice-first devices that sometimes have a screen. Single-file HTML bundles with Vite work well.

## DynamoDB Local

**What worked:** Running the same contract suite against DynamoDB Local and the in-memory store gave us confidence that transactional writes and key ranges behave identically before touching AWS.
