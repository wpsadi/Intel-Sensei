# Shared Firecrawl MCP

Firecrawl is available to Ask Sensei, SBrowse, S-Note, SDraw, S-3D, S-Design, and live voice calls. Configure it once in **Settings → AI providers → Firecrawl**:

- Save a Firecrawl API key to use Bearer authentication.
- Without a key, choose **Connect Firecrawl** and complete OAuth. Sensei verifies the callback state and PKCE code before returning to the original page, including its file and chat references.
- Use **Test MCP connection** to verify tool discovery. **Disconnect OAuth** clears local OAuth credentials; a separately saved API key remains configured.

API keys take precedence if both methods are present. OAuth tokens, refresh tokens, and client registration use the existing vault-aware secret store and participate in secret encryption and backups. Pending OAuth state and the PKCE verifier are scoped to the current browser tab and cleared after completion. Background agent requests never navigate the user to sign-in; they report a reconnect instruction instead.

The app uses these official Streamable HTTP MCP configurations. For an external MCP client, the equivalent configurations are:

```json
{
  "firecrawl": {
    "type": "http",
    "url": "https://mcp.firecrawl.dev/v2/mcp-oauth"
  }
}
```

With an API key:

```json
{
  "firecrawl": {
    "type": "http",
    "url": "https://mcp.firecrawl.dev/v2/mcp",
    "headers": {
      "Authorization": "Bearer <FIRECRAWL_API_KEY>"
    }
  }
}
```

Every agent receives the shared web-use instructions and two MCP gateway tools. `firecrawl_mcp_tools` discovers current server tools with their exact input schemas, filtered and paginated to keep context manageable. `firecrawl_mcp_call` executes an exact discovered name with its arguments. Available capabilities depend on the connected account and server; the app does not hard-code an assumed full tool catalogue.

Existing `webSearch` and `scrape` tools retain their familiar UI and bounded results while using the same MCP connection when configured. Without a key or OAuth connection, basic keyless REST search and page reading remain available with Firecrawl's service limits. An MCP authentication or service failure is reported rather than silently replayed through REST. Discovery and native tool calls carry cancellation/time limits; credentials are checked on every operation, and calls are not automatically replayed after an error.

Firecrawl retrieves public web content independently of the user's browser cookies. It cannot inspect a logged-in tab, read the local drawing, or act on the current application. Agents use the browser's computer tool for live tab state and native app tools for notes and drawings. Their shared instructions distinguish search, reading one known page, site mapping, and asynchronous jobs; require exact discovered schemas; and treat scraped content as data rather than new agent instructions.

The OAuth callback route is `/mcp/firecrawl/callback`; production hosting must serve the SPA there, as for other application routes. Account authorization and browser CORS behavior require a live end-to-end check with a Firecrawl account. Automated coverage exercises the real MCP SDK handshake, endpoints and headers, discovery, gateway execution, existing search/scrape adapters, cancellation, credential removal, and OAuth state/PKCE handling without contacting the service.
