# Nosana Agentic MCP

Welcome to the **Nosana Agentic MCP** repository! This project integrates [Nosana](https://nosana.com/) compute network deployments and jobs with AI agents using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

With this integration, AI agents (like Claude Desktop, Cursor, or any MCP-compatible client) can directly interact with the Nosana network to deploy AI models, monitor jobs, manage secrets, and control scaling—all through natural language.

---

## 🏗️ Repository Structure

This repository is organized into three main components:

1. **`mcp-server/`** - The core MCP Server implementation.
2. **`main/nosana-dashboard/`** - A comprehensive Web Dashboard to monitor deployments and manage your Agentic AI configuration.
3. **`agent-skills/`** - Custom AI skills and configurations for interacting with Nosana.

---

## 🚀 1. MCP Server (`mcp-server/`)

The Nosana MCP Server exposes a robust set of tools allowing AI agents to fully manage your compute on the Nosana Network.

### Available AI Tools:
- **Deployment Management**: `deploy_model`, `list_deployments`, `get_deployment`, `restart_deployment`, `stop_deployment`
- **Scaling & Configuration**: `update_replicas`, `update_timeout`, `get_gpu_options`
- **Job Execution**: `compose_job_definition`, `post_job_definition`, `list_jobs`, `get_job_status`, `stop_job`, `extend_job`
- **Logs & Artifacts**: `get_deployment_logs`, `get_job_logs`, `download_artifacts`, `upload_secrets`
- **Diagnostics**: `diagnose`, `analyze_model`, `get_ssh_command`, `check_market_queue`

### How to use with Claude Desktop or Cursor:
You can connect this MCP Server directly to your IDE or Agent. Simply provide the following configuration:

```json
{
  "mcpServers": {
    "nosana": {
      "command": "npx",
      "args": ["nosana-deployment-mcp"],
      "env": {
        "NOSANA_API_KEY": "your_nosana_api_key_here"
      }
    }
  }
}
```

---

## 📊 2. Nosana Dashboard (`main/nosana-dashboard/`)

A modern Nuxt 3 web dashboard that serves as a control center for your Nosana operations. 

### Features:
- **Deployment Overview**: See all active and stopped deployments.
- **Billing & Account Management**: Track your GPU credits and Solana balance.
- **Agentic AI Configuration Hub**: Easily generate and copy your personalized MCP JSON configuration to paste into your IDE.

### Running the Dashboard Locally:
```bash
cd main/nosana-dashboard
npm install
npm run dev
```

---

## 🧠 3. Agent Skills (`agent-skills/`)

This directory contains advanced configurations and definitions (`SKILL.md`) for specialized AI engineers and orchestrators. It provides strict guidelines to LLMs on how to write jobs, manage secrets, and orchestrate complex workloads safely.

---

## 🔒 Prerequisites & Security

- **Nosana Account**: You need an active Nosana account.
- **API Key**: Required to interact with the backend APIs via the MCP server.
- **Node.js**: `v18+` recommended.

> **Note:** Never commit your `NOSANA_API_KEY` to public repositories. Always use `.env` files and environment variables.

---

## 🤝 Contributing
Contributions are welcome! Please open an issue or submit a Pull Request if you'd like to add new tools to the MCP server or improve the dashboard UI.
