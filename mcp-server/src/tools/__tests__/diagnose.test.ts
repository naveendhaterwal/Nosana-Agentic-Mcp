import { describe, it, expect, vi, beforeEach } from "vitest";
import { diagnoseDeployment } from "../diagnose.js";
import { getNosanaClient } from "../../nosana/client.js";
import { getJobLogs } from "../get_job_logs.js";

// Mock dependencies
vi.mock("../../nosana/client.js", () => ({
  getNosanaClient: vi.fn(),
}));

vi.mock("../get_job_logs.js", () => ({
  getJobLogs: vi.fn(),
}));

describe("diagnoseDeployment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("Suite 1: Successful Deployment Diagnosis with OOM Error", async () => {
    // Arrange: Mock the deployment API to return a failed deployment
    const mockGetEvents = vi.fn().mockResolvedValue({
      events: [{ created_at: "2023-01-01", type: "ERROR", message: "Container crashed" }]
    });
    
    const mockGetJobs = vi.fn().mockResolvedValue({
      jobs: [{ id: "job-123" }]
    });

    const mockDeploymentsGet = vi.fn().mockResolvedValue({
      status: "FAILED",
      getEvents: mockGetEvents,
      getJobs: mockGetJobs,
    });

    (getNosanaClient as any).mockReturnValue({
      api: {
        deployments: { get: mockDeploymentsGet },
        jobs: { get: vi.fn() },
      },
    });

    // Arrange: Mock the log retrieval to return an OOM error
    (getJobLogs as any).mockResolvedValue(
      JSON.stringify({ status: "FAILED", logs: "Traceback: CUDA out of memory. Tried to allocate 20MiB." })
    );

    // Act
    const resultJson = await diagnoseDeployment("dep-123");
    const result = JSON.parse(resultJson);

    // Assert
    expect(result.deploymentId).toBe("dep-123");
    expect(result.status).toBe("FAILED");
    expect(result.rootCause).toContain("GPU Out of Memory");
    expect(result.severity).toBe("high");
    expect(result.suggestedActions.some((a: any) => a.action === "Upgrade GPU tier")).toBe(true);
  });

  it("Suite 2: Job ID Fallback on Deployment Not Found", async () => {
    // Arrange: Deployments API throws an error (e.g. ID not found)
    const mockDeploymentsGet = vi.fn().mockRejectedValue(new Error("Not found"));
    
    // Arrange: Jobs API succeeds with state 3 (FAILED)
    const mockJobsGet = vi.fn().mockResolvedValue({
      id: "job-456",
      state: 3, // 3 = FAILED in Nosana API
    });

    (getNosanaClient as any).mockReturnValue({
      api: {
        deployments: { get: mockDeploymentsGet },
        jobs: { get: mockJobsGet },
      },
    });

    (getJobLogs as any).mockResolvedValue(
      JSON.stringify({ logs: "ModuleNotFoundError: No module named 'torch'" })
    );

    // Act
    const resultJson = await diagnoseDeployment("job-456");
    const result = JSON.parse(resultJson);

    // Assert
    expect(mockJobsGet).toHaveBeenCalledWith("job-456");
    expect(result.status).toBe("FAILED");
    expect(result.rootCause).toContain("Missing Python dependency");
    expect(result.suggestedActions.some((a: any) => a.action === "Fix requirements.txt")).toBe(true);
  });

  it("Suite 3: API Error / Adversarial Input Handling", async () => {
    // Arrange: Both APIs throw errors (e.g., network failure or malformed ID)
    (getNosanaClient as any).mockReturnValue({
      api: {
        deployments: { get: vi.fn().mockRejectedValue(new Error("Network Error")) },
        jobs: { get: vi.fn().mockRejectedValue(new Error("Network Error")) },
      },
    });

    // Act: The tool should NOT throw an exception, it should return a structured error JSON
    const resultJson = await diagnoseDeployment("invalid-id-$$$");
    const result = JSON.parse(resultJson);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.hint).toContain("Ensure the deployment/job ID is correct");
  });
});
