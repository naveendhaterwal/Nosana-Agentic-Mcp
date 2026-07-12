---
name: nosana-monitor
description: Monitor running Nosana jobs, stream logs, and check node health.
---

# Nosana Monitor Skill

This skill allows Antigravity to monitor deployed compute jobs on the Nosana network, retrieve real-time logs, and check the status of specific marketplace nodes.

## Prerequisites
The MCP Server must be running locally or remotely (configured via `mcp-builder`).

## Available MCP Tools
This skill relies on the **Monitor Agent** in the Nosana MCP Server:

1. `monitor.get_job_status`
   - **Purpose:** Fetch the current blockchain status of a deployed job (e.g., QUEUED, RUNNING, COMPLETED).
   - **Arguments:** `{ "jobId": "string" }`

2. `monitor.get_job_logs`
   - **Purpose:** Retrieve the active logs from the specific node running the job.
   - **Arguments:** `{ "jobId": "string" }`

3. `monitor.list_active_jobs`
   - **Purpose:** List all currently active jobs for a specific user wallet.
   - **Arguments:** `{ "walletAddress": "string" }`

## Usage Instructions
When a user asks to "check my job", "get logs for my deployment", or "why is my job stuck":
1. Use `mcp-builder` to ensure the Nosana MCP is running.
2. Call `monitor.get_job_status` first to determine if the job has been picked up by a node.
3. If the status is `RUNNING`, call `monitor.get_job_logs` to fetch the real-time standard output from the container.
4. Format the logs cleanly for the user in a markdown code block.
