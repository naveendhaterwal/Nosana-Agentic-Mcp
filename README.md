# Nosana Agentic MCP

Welcome to the **Nosana Agentic MCP** repository! This project provides a powerful [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that integrates [Nosana](https://nosana.com/) compute network deployments and jobs with AI agents.

By connecting this MCP server to your AI agent (such as Claude Desktop, Cursor, or any MCP-compatible client), you empower it to directly interact with the Nosana network. Your AI can now deploy AI models, monitor jobs, manage secrets, and control scaling—all through natural language.

---

## 🚀 Available AI Tools

The Nosana MCP Server exposes a robust set of tools allowing AI agents to fully manage your compute infrastructure:

- **Deployment Management**: `deploy_model`, `list_deployments`, `get_deployment`, `restart_deployment`, `stop_deployment`
- **Scaling & Configuration**: `update_replicas`, `update_timeout`, `get_gpu_options`
- **Job Execution**: `compose_job_definition`, `post_job_definition`, `list_jobs`, `get_job_status`, `stop_job`, `extend_job`
- **Logs & Artifacts**: `get_deployment_logs`, `get_job_logs`, `download_artifacts`, `upload_secrets`
- **Diagnostics**: `diagnose`, `analyze_model`, `get_ssh_command`, `check_market_queue`

---

## ⚙️ Quick Start (IDE & Agent Integration)

You can seamlessly connect this MCP Server directly to your IDE or Agent. Simply provide the following configuration in your `claude_desktop_config.json` or your Cursor MCP settings.

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
*Make sure to replace `"your_nosana_api_key_here"` with your actual API key.*

---

## 🔒 Prerequisites & Security

- **Nosana Account**: You need an active Nosana account.
- **API Key**: Required to authenticate requests to the Nosana network. 
- **Node.js**: `v18+` is required to run the `npx` command.

> **⚠️ Security Warning:** Never commit your `NOSANA_API_KEY` to public repositories. Always use `.env` files or secure secret managers when developing locally.

---

## 🛠️ Local Development

If you want to contribute or run the MCP server from source:

1. Clone the repository:
   ```bash
   git clone https://github.com/naveendhaterwal/Nosana-Agentic-Mcp.git
   cd Nosana-Agentic-Mcp/mcp-server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a Pull Request if you'd like to add new tools to the MCP server, fix bugs, or improve the documentation.
