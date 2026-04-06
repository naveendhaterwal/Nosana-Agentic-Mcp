import { getNosanaClient } from "../nosana/client.js";

interface LogFilters {
  opName?: string;
  logLevel?: string; // 'info', 'warn', 'error' etc (if present in logs)
  searchText?: string;
  tailLimit?: number;
}

/**
 * tool: get_job_logs
 * description: Retrieves execution logs for a Nosana job with optional filters.
 */
export async function getJobLogs(jobId: string, filters: LogFilters = {}): Promise<string> {
  const client = getNosanaClient();
  if (!client.api) {
    throw new Error("Nosana API client is required. Please set NOSANA_API_KEY.");
  }

  try {
    // 1. Fetch job data
    const job = await client.api.jobs.get(jobId);

    const statusMap: Record<number, string> = {
      0: "QUEUED",
      1: "RUNNING",
      2: "COMPLETED",
      3: "FAILED",
      4: "STOPPED",
    };
    const status = statusMap[job.state] ?? "UNKNOWN";

    if (status === "QUEUED" || status === "RUNNING") {
      return JSON.stringify({
        success: true,
        jobId,
        status,
        message: `Job is ${status}. Logs will be available on IPFS once it finishes.`,
        logs: ""
      }, null, 2);
    }

    const ipfsHash = job.ipfs_result ?? job.result ?? job.ipfsResult;
    if (!ipfsHash) {
      return JSON.stringify({
        success: true,
        jobId,
        status,
        message: "No result IPFS hash found for this job.",
        logs: ""
      }, null, 2);
    }

    // 2. Retrieve from IPFS
    let rawData: any;
    try {
      rawData = await client.ipfs.retrieve(ipfsHash);
    } catch (err) {
      // Fallback to gateway
      const gatewayUrl = `https://ipfs.nosana.com/ipfs/${ipfsHash}`;
      const res = await fetch(gatewayUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        try { rawData = JSON.parse(text); } catch { rawData = text; }
      }
    }

    if (!rawData) {
      throw new Error("Failed to retrieve logs from IPFS.");
    }

    // 3. Process and filter logs
    const logs = processLogs(rawData, filters);

    return JSON.stringify({
      success: true,
      jobId,
      status,
      ipfsHash,
      logs,
      filtersApplied: Object.keys(filters).length > 1 // jobId is always there
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message }, null, 2);
  }
}

function processLogs(data: any, filters: LogFilters): string {
  let lines: string[] = [];

  if (Array.isArray(data.op_states)) {
    // Structured logs
    for (const op of data.op_states) {
      const name = op.operationId ?? op.id ?? "unknown";
      
      // Filter by opName
      if (filters.opName && !name.toLowerCase().includes(filters.opName.toLowerCase())) continue;

      lines.push(`\n═══ Operation: ${name} ═══`);
      if (op.stdout) lines.push(op.stdout.trim());
      if (op.stderr) lines.push(`[stderr]\n${op.stderr.trim()}`);
    }
  } else if (typeof data === "string") {
    lines = data.split("\n");
  } else if (data.stdout || data.stderr) {
    if (data.stdout) lines.push(data.stdout.trim());
    if (data.stderr) lines.push(`[stderr]\n${data.stderr.trim()}`);
  } else {
    lines = [JSON.stringify(data, null, 2)];
  }

  // Flatten if it was from op_states and contains nested newlines
  let allLines = lines.join("\n").split("\n");

  // Apply filters to lines
  if (filters.searchText) {
    const search = filters.searchText.toLowerCase();
    allLines = allLines.filter(l => l.toLowerCase().includes(search));
  }

  if (filters.logLevel) {
    const level = filters.logLevel.toUpperCase();
    allLines = allLines.filter(l => l.toUpperCase().includes(level));
  }

  if (filters.tailLimit && filters.tailLimit > 0) {
    allLines = allLines.slice(-filters.tailLimit);
  }

  return allLines.join("\n");
}
