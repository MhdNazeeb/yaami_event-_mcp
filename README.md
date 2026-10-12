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

### HTTP API (Express)

```bash
npm start
```

- Health: `GET /health`
- REST mirrors core operations under `/api/events`

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

### Example: Cursor / Claude Desktop MCP config

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
