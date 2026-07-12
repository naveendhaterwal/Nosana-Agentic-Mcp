---
name: nosana-doctor
description: Diagnose failed jobs, check node constraints, and analyze blockchain errors.
---

# Nosana Doctor Skill

This skill provides diagnostic capabilities for jobs deployed on the Nosana network. It helps users understand why a job failed to run or why a node rejected a workload.

## Prerequisites
The MCP Server must be running locally or remotely (configured via `mcp-builder`).

## Available MCP Tools
This skill relies on the **Doctor Agent** in the Nosana MCP Server:

1. `doctor.diagnose_job_failure`
   - **Purpose:** Analyze a specific job that has a `FAILED` or `STOPPED` status and determine the root cause (e.g., OOM, exit code > 0, image pull error).
   - **Arguments:** `{ "jobId": "string" }`

2. `doctor.check_market_constraints`
   - **Purpose:** Compare a job's requirements (VRAM, network) against a specific GPU market's constraints to see why it isn't being picked up.
   - **Arguments:** `{ "jobDefinition": "string", "marketAddress": "string" }`

3. `doctor.get_network_health`
   - **Purpose:** Check the overall status of the Nosana blockchain program and endpoints.
   - **Arguments:** `{}`

## Usage Instructions
When a user asks to "debug my job", "why did my deployment fail", or "why isn't my job starting":
1. Use `mcp-builder` to ensure the Nosana MCP is running.
2. If the user provides a `jobId`, use `doctor.diagnose_job_failure` to fetch error logs, exit codes, and node events.
3. If the user's job is stuck in `QUEUED`, use `doctor.check_market_constraints` to verify their `jobDefinition` meets the minimum requirements of the selected market.
4. Present the root cause clearly to the user with actionable next steps (e.g., "You need to request more VRAM", "Your Docker image failed to pull because it's private").
