# Event MCP Server

Production-oriented **Model Context Protocol (MCP)** server for an event management company. It persists events and inquiries in **MongoDB**, exposes MCP tools for AI assistants, and runs an optional **Express** HTTP API for health checks and REST access.

## Architecture

```text
event-mcp-server/
├── src/
│   ├── config/          # MongoDB connection & environment
│   ├── models/          # Mongoose Event schema
│   ├── services/        # Business logic
│   ├── mcp/             # MCP server & tools
│   ├── types/           # Shared TypeScript types
│   ├── app.ts           # Express app
│   └── server.ts        # Entry point (HTTP or MCP stdio)
├── .env.example
├── package.json
└── README.md
```

## Event statuses

| Status          | Description                          |
|-----------------|--------------------------------------|
| `pending`       | New inquiry, not yet confirmed       |
| `advance_paid`  | Client paid an advance               |
| `confirmed`     | Event confirmed                      |
| `completed`     | Event finished                       |
| `cancelled`     | Event cancelled                      |

## Setup

1. Copy environment file and adjust values:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Start MongoDB locally (or point `MONGODB_URI` at Atlas).

## Run modes

### HTTP API + remote MCP (Express)

```bash
npm start
```

- Health: `GET /health`
- **Remote MCP (Streamable HTTP):** `POST /mcp` — use this URL when hosting on Render and connecting Claude or Cursor over HTTPS
- REST mirrors core operations under `/api/events`

Set `MCP_API_TOKEN` in production so clients must send `Authorization: Bearer <token>` on `/mcp`.

### MCP over stdio (Claude Desktop, Cursor, Inspector)

```bash
npm run start:mcp
```

Or:

```bash
MCP_TRANSPORT=stdio node dist/server.js
```

**Important:** MCP uses stdout for the protocol. Application logs go to stderr.

## MCP tools

| Tool                   | Purpose                                              |
|------------------------|------------------------------------------------------|
| `create_event`         | Save a new event from inquiry details                |
| `get_events_by_date`   | List events for one day or a date range              |
| `get_events_by_status` | Filter by `pending`, `advance_paid`, etc.            |
| `update_event_status`  | Update status, advance, budget, or notes             |

### Example: local stdio (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "yaami-events": {
      "command": "node",
      "args": ["/absolute/path/to/yaami-event/dist/server.js", "--mcp"],
      "env": {
        "MONGODB_URI": "mongodb://127.0.0.1:27017/yaami_events"
      }
    }
  }
}
```

### Deploy on Render

1. Push this repo to GitHub and create a **Blueprint** from `render.yaml`, or add a **Web Service** with:
   - **Build:** `npm install --include=dev && npm run build`
   - **Start:** `npm start`
   - **Health check path:** `/health`
2. Set **`MONGODB_URI`** (e.g. MongoDB Atlas) in the Render dashboard. Render auto-generates **`MCP_API_TOKEN`** from the blueprint.
3. After deploy, your MCP URL is:

   `https://<your-service>.onrender.com/mcp`

   Free instances spin down when idle; the first request may take 30–60s (cold start). Use a paid plan for always-on if connectors time out.

### Connect Claude (claude.ai / mobile app)

Remote servers use **Settings → Connectors → Add custom connector**, not `claude_desktop_config.json`.

| Field | Value |
|--------|--------|
| URL | `https://<your-service>.onrender.com/mcp` |
| Auth | Bearer token = your Render `MCP_API_TOKEN` |

### Example: Cursor / Claude Desktop over HTTPS (hosted MCP)

```json
{
  "mcpServers": {
    "yaami-events": {
      "url": "https://your-service.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_TOKEN"
      }
    }
  }
}
```

Claude Desktop may require `"type": "streamable-http"` on the same entry.

## Development

```bash
npm run dev      # HTTP via tsx watch (no build step)
npm run dev:mcp  # MCP stdio via tsx watch
npm run typecheck
```

## Requirements

- Node.js 20+
- MongoDB 6+
# yaami_event-_mcp
