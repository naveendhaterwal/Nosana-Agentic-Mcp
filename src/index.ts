import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Tool Imports
import { analyzeModel } from "./tools/analyze_model.js";
import { getGpuOptions } from "./tools/get_gpu_options.js";
import { deployModel } from "./tools/deploy_model.js";
import { getDeploymentStatus } from "./tools/get_deployment_status.js";
import { checkMarketQueue } from "./tools/check_market_queue.js";
import { uploadArtifact } from "./tools/upload_artifact.js";
import { composeJobDefinition } from "./tools/compose_job_definition.js";
import { postJobDefinition } from "./tools/post_job_definition.js";
import { getJobStatus } from "./tools/get_job_status.js";
import { getJobLogs } from "./tools/get_job_logs.js";
import { smartDeploy } from "./tools/smart_deploy.js";
import { getDeployment } from "./tools/get_deployment.js";
import { listDeployments } from "./tools/list_deployments.js";
import { stopDeployment } from "./tools/stop_deployment.js";
import { updateReplicas } from "./tools/update_replicas.js";
import { updateTimeout } from "./tools/update_timeout.js";
import { createRevision } from "./tools/create_revision.js";
import { getDeploymentEvents } from "./tools/get_deployment_events.js";
import { getDeploymentLogs } from "./tools/get_deployment_logs.js";
import { restartDeployment } from "./tools/restart_deployment.js";
import { getDeploymentOptions } from "./tools/get_deployment_options.js";

const server = new Server(
  {
    name: "nosana-deploy",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "smart_deploy",
        description: "The primary, intelligent entry point for Nosana deployment. Handles app detection, artifact packaging, and end-to-end verification.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string" },
            gpuTier: { type: "string", enum: ["cheapest", "balanced", "performance"] },
            duration: { type: "string", enum: ["short", "keep", "custom"] },
            customTimeoutMinutes: { type: "number" },
            artifactUrl: { type: "string" },
            appName: { type: "string" }
          },
          required: ["projectPath", "gpuTier", "duration"]
        }
      },
      {
        name: "get_deployment_options",
        description: "[MANDATORY PRE-DEPLOYMENT GATE] Call this first with projectPath to get the GPU and duration options to present to the user. You must ask the user for these choices before calling smart_deploy.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string" }
          },
          required: ["projectPath"]
        }
      },
      {
        name: "analyze_model",
        description: "Analyze a model directory or file to determine its framework and VRAM requirements.",
        inputSchema: {
          type: "object",
          properties: {
            modelPath: { type: "string" }
          },
          required: ["modelPath"]
        }
      },
      {
        name: "get_gpu_options",
        description: "List currently available GPU markets on Nosana, along with VRAM and hourly pricing limits.",
        inputSchema: {
          type: "object",
          properties: {
            recommendedVram: { type: "number", description: "Optional recommended VRAM from analyze_model to filter GPUs" }
          }
        }
      },
      {
        name: "check_market_queue",
        description: "Check the live queue health and congestion of a specific Nosana GPU market. Use this to ensure a market has GPUs available before deploying.",
        inputSchema: {
          type: "object",
          properties: {
            marketAddress: { type: "string", description: "The base58 address of the market to check (from get_gpu_options)" }
          },
          required: ["marketAddress"]
        }
      },
      {
        name: "deploy_model",
        description: "Deploy an ML model to the Nosana GPU network using the official Enterprise Deployment API.",
        inputSchema: {
          type: "object",
          properties: {
            modelPath: { type: "string", description: "Local path to the model directory" },
            marketAddress: { type: "string", description: "Nosana market address (from get_gpu_options)" },
            baseImage: { type: "string", description: "Docker base image (e.g. python:3.10-slim)" },
            requiredVram: {
              type: "number",
              description: "Required GPU VRAM in GB (e.g. 4, 8, 16). Recommended value from analyze_model."
            },
            name: {
              type: "string",
              description: "A name for this deployment (e.g. 'my-model-api')"
            },
            replicas: { type: "number", description: "Number of parallel GPU instances (default 1)" },
            strategy: { type: "string", description: "Deployment strategy: SIMPLE, SCHEDULED, INFINITE, SIMPLE-EXTEND (default SIMPLE)" },
            timeout: { type: "number", description: "Maximum execution time in minutes (default 60)" }
          },
          required: ["modelPath", "marketAddress", "baseImage", "requiredVram", "timeout"]
        }
      },
      {
        name: "get_deployment_status",
        description: "Checks the status of a deployed job and returns the live API URL once running.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            checkHealth: { type: "boolean", default: false, description: "If true, will attempt to ping the live URL to verify HTTP 200 readiness." }
          },
          required: ["jobId"]
        }
      },
      {
        name: "upload_artifact",
        description: "Package a local directory as .tar.gz and upload it to Nosana IPFS for deployment.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: { type: "string", description: "Local path to the project folder" }
          },
          required: ["folderPath"]
        }
      },
      {
        name: "compose_job_definition",
        description: "Generate a valid Nosana JobDefinition JSON for a project (Streamlit, FastAPI, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string" },
            appType: { type: "string", enum: ["streamlit", "fastapi", "jupyter", "ollama", "comfyui", "custom"] },
            port: { type: "number", default: 8000 },
            customImage: { type: "string" },
            requiredVram: { type: "number", default: 8 },
            resourceUrl: { type: "string", description: "IPFS URI from upload_artifact (optional)" }
          },
          required: ["projectPath"]
        }
      },
      {
        name: "post_job_definition",
        description: "Submit a raw JobDefinition JSON to a Nosana market.",
        inputSchema: {
          type: "object",
          properties: {
            jobDefinitionJson: { type: "string" },
            marketAddress: { type: "string" },
            name: { type: "string" },
            strategy: { type: "string", default: "SIMPLE", enum: ["SIMPLE", "SIMPLE-EXTEND", "INFINITE"] },
            timeout: { type: "number", default: 60 }
          },
          required: ["jobDefinitionJson", "marketAddress"]
        }
      },
      {
        name: "get_job_status",
        description: "Poll the live status and resolve the public URL of a Nosana job.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" }
          },
          required: ["jobId"]
        }
      },
      {
        name: "get_job_logs",
        description: "Retrieve execution logs for a Nosana job from IPFS. Works best once a job has entered a terminal state (COMPLETED, FAILED, STOPPED). For running jobs, returns a status message instead.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string", description: "The job address/ID to retrieve logs for" },
            opName: { type: "string", description: "Optional: Filter logs by operation name" },
            searchText: { type: "string", description: "Optional: Search text to filter lines" },
            tailLimit: { type: "number", description: "Optional: Limit the number of lines returned from the end of the log" }
          },
          required: ["jobId"]
        }
      },
      {
        name: "get_deployment",
        description: "Retrieve full details of a Nosana deployment by ID, including status, replicas, and live URLs.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string", description: "The unique ID of the deployment" }
          },
          required: ["deploymentId"]
        }
      },
      {
        name: "list_deployments",
        description: "List all Nosana deployments for the authenticated user.",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "Filter by status: RUNNING, STOPPED, STARTING, etc." },
            limit: { type: "number", description: "Maximum number of deployments to return" }
          }
        }
      },
      {
        name: "stop_deployment",
        description: "Gracefully stop an active Nosana deployment.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" }
          },
          required: ["deploymentId"]
        }
      },
      {
        name: "update_replicas",
        description: "Update the number of running instances (replicas) for an existing deployment.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" },
            replicas: { type: "number" }
          },
          required: ["deploymentId", "replicas"]
        }
      },
      {
        name: "update_timeout",
        description: "Update the execution timeout (in minutes) for an existing deployment.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" },
            timeoutMinutes: { type: "number" }
          },
          required: ["deploymentId", "timeoutMinutes"]
        }
      },
      {
        name: "create_revision",
        description: "Create a new revision for an existing deployment with a modified job definition. Preserves existing config if partial definition is provided.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" },
            jobDefinition: { type: "object", description: "The new JobDefinition object or a partial override" }
          },
          required: ["deploymentId", "jobDefinition"]
        }
      },
      {
        name: "get_deployment_events",
        description: "Retrieve history of state changes and events for a Nosana deployment.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" },
            limit: { type: "number", default: 20 }
          },
          required: ["deploymentId"]
        }
      },
      {
        name: "get_deployment_logs",
        description: "Fetch and aggregate logs from jobs associated with a deployment.",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string" },
            jobId: { type: "string", description: "Optional: specific job ID in the deployment" },
            searchText: { type: "string" },
            tailLimit: { type: "number" }
          },
          required: ["deploymentId"]
        }
      },
      {
        name: "restart_deployment",
        description: "Restart a stopped or failed deployment by creating a new one with the same configuration (cloning name, market, replicas, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            deploymentId: { type: "string", description: "The ID of the deployment to restart" }
          },
          required: ["deploymentId"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    let result: string = "";
    
    switch (name) {
      case "smart_deploy":
        result = await smartDeploy({
          projectPath: args?.projectPath as string,
          gpuTier: args?.gpuTier as any,
          duration: args?.duration as any,
          customTimeoutMinutes: args?.customTimeoutMinutes as number | undefined,
          artifactUrl: args?.artifactUrl as string | undefined,
          appName: args?.appName as string | undefined
        });
        break;
      case "get_deployment_options":
        result = await getDeploymentOptions(args?.projectPath as string);
        break;
      case "analyze_model":
        result = await analyzeModel(args?.modelPath as string);
        break;
      case "get_gpu_options":
        result = await getGpuOptions(args?.recommendedVram as number | undefined);
        break;
      case "check_market_queue":
        result = await checkMarketQueue(args?.marketAddress as string);
        break;
      case "deploy_model":
        result = await deployModel(
          args?.modelPath as string,
          args?.marketAddress as string,
          args?.baseImage as string,
          args?.name as string | undefined,
          args?.replicas as number | undefined,
          args?.strategy as string | undefined,
          args?.timeout as number | undefined,
          args?.requiredVram as number | undefined
        );
        break;
      case "get_deployment_status":
        result = await getDeploymentStatus(args?.jobId as string, args?.checkHealth as boolean | undefined);
        break;
      case "upload_artifact":
        result = await uploadArtifact(args?.folderPath as string);
        break;
      case "compose_job_definition":
        result = await composeJobDefinition(
          args?.projectPath as string,
          args?.appType as string | undefined,
          args?.port as number | undefined,
          args?.customImage as string | undefined,
          args?.entrypoint as string[] | undefined,
          args?.cmd as string[] | undefined,
          args?.env as Record<string, string> | undefined,
          args?.workDir as string | undefined,
          args?.requiredVram as number | undefined,
          args?.resourceUrl as string | undefined
        );
        break;
      case "post_job_definition":
        result = await postJobDefinition(
          args?.jobDefinitionJson as string,
          args?.marketAddress as string,
          args?.timeout as number | undefined,
          args?.name as string | undefined,
          args?.strategy as string | undefined
        );
        break;
      case "get_job_status":
        result = await getJobStatus(args?.jobId as string);
        break;
      case "get_job_logs":
        result = await getJobLogs(args?.jobId as string, {
          opName: args?.opName as string | undefined,
          searchText: args?.searchText as string | undefined,
          tailLimit: args?.tailLimit as number | undefined
        });
        break;
      case "get_deployment":
        result = await getDeployment(args?.deploymentId as string);
        break;
      case "list_deployments":
        result = await listDeployments({
          status: args?.status as string | undefined,
          limit: args?.limit as number | undefined
        });
        break;
      case "stop_deployment":
        result = await stopDeployment(args?.deploymentId as string);
        break;
      case "update_replicas":
        result = await updateReplicas(args?.deploymentId as string, args?.replicas as number);
        break;
      case "update_timeout":
        result = await updateTimeout(args?.deploymentId as string, args?.timeoutMinutes as number);
        break;
      case "create_revision":
        result = await createRevision(args?.deploymentId as string, args?.jobDefinition as any);
        break;
      case "get_deployment_events":
        result = await getDeploymentEvents(args?.deploymentId as string, args?.limit as number | undefined);
        break;
      case "get_deployment_logs":
        result = await getDeploymentLogs(args?.deploymentId as string, {
          jobId: args?.jobId as string | undefined,
          searchText: args?.searchText as string | undefined,
          tailLimit: args?.tailLimit as number | undefined
        });
        break;
      case "restart_deployment":
        result = await restartDeployment(args?.deploymentId as string);
        break;
      default:
        throw new Error(`Tool ${name} not implemented.`);
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Nosana Deploy MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
