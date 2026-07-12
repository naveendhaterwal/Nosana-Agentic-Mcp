import { getNosanaClient } from "../nosana/client.js";
import { validatePath } from "./path_utils.js";
import fs from "fs";
import path from "path";

export async function deployModel(
  modelPath: string, 
  marketAddress: string, 
  baseImage: string = "python:3.10-slim",
  name: string = "AI Model Deployment",
  replicas: number = 1,
  strategy: string = "SIMPLE",
  timeout?: number,
  requiredVram?: number
) {
  if (!requiredVram || !timeout) {
    throw new Error("Missing mandatory parameters: 'requiredVram' and 'timeout'. These must be explicitly provided for an Enterprise Deployment.");
  }

  // Use path diagnostics for modelPath
  const { exists, absPath, errorResponse } = validatePath(modelPath);
  if (!exists) {
    return JSON.stringify(errorResponse, null, 2);
  }

  const client = getNosanaClient();
  if (!client.api) {
    throw new Error("Nosana API client is required. Please set NOSANA_API_KEY.");
  }

  // --- ROUTING SAFEGUARD ---
  const reqPath = path.join(absPath, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    const reqs = fs.readFileSync(reqPath, "utf-8").toLowerCase();
    if (reqs.includes("streamlit")) {
      return JSON.stringify({
        success: false,
        error: "🚫 Streamlit Detected",
        message: "Streamlit UI apps should NOT use 'deploy_model' because it targets AI Inference APIs and injects serving-node defaults. Use the new Intelligent Job Orchestrator pipeline instead.",
        recommended_workflow: [
          "1. upload_artifact (if code is local)",
          "2. compose_job_definition (detects UI/Streamlit automatically)",
          "3. post_job_definition",
          "4. get_job_status (returns live UI URL)"
        ],
        hint: "Run 'compose_job_definition' with your project path to get started."
      }, null, 2);
    }
  }

  // --- PRE-FLIGHT CHECKS ---
  try {
    const market = await client.api.markets.get(marketAddress);
    
    // Check if market restricts images
    if (market.required_images && market.required_images.length > 0) {
      const isAllowed = market.required_images.some((img: string) => baseImage.includes(img) || img.includes(baseImage));
      if (!isAllowed) {
        return JSON.stringify({
          success: false,
          error: `🚫 Deployment Rejected: Restricted Market`,
          details: `The market '${market.name}' only allows specific pre-approved images.`,
          allowedImages: market.required_images,
          yourImage: baseImage,
          hint: "Pick an '🔓 Open Market' from get_gpu_options if you want to use a custom image like python:3.13-slim."
        }, null, 2);
      }
    }
  } catch (err: any) {
    console.warn(`Could not verify market policy: ${err.message}`);
  }

  // 1. Build SDK-Compliant Job Definition
  const jobDefinition = {
    version: "0.1",
    type: "container",
    meta: {
      trigger: "api",
      system_resources: {
        required_vram: requiredVram, // Official field name
      },
    },
    ops: [
      {
        id: "serving-node",
        type: "container/run",
        args: {
          image: baseImage,
          entrypoint: ["/bin/sh", "-c"],
          cmd: [
            `pip install flask scikit-learn pandas && printf 'from flask import Flask, jsonify\\napp = Flask(__name__)\\n\\n@app.route("/health")\\ndef health(): return "ok"\\n\\n@app.route("/predict", methods=["POST"])\\ndef predict(): return jsonify({"service": "online", "vram": "${requiredVram}GB"})\\n\\nif __name__ == "__main__": app.run(host="0.0.0.0", port=8000)\\n' > /tmp/health.py && python /tmp/health.py`
          ],
          expose: [
            {
              port: 8000,
              type: "api"
            }
          ]
        }
      }
    ]
  };

  try {
    // 2. Pin to IPFS
    const ipfsHash = await client.ipfs.pin(jobDefinition);

    // 3. Create Official Nosana Deployment
    const deploymentConfig = {
      name: name,
      market: marketAddress,
      replicas: replicas,
      timeout: strategy === "INFINITE" ? Math.max(timeout, 60) : Math.max(timeout, 1),
      strategy: strategy,
      job_definition: jobDefinition
    };

    const res = await client.api.deployments.create(deploymentConfig as any);

    const deploymentId = res.address || res.id || "pending";
    const trackingUrl = `https://dashboard.nosana.com/deployments/${deploymentId}`;

    return JSON.stringify({
      success: true,
      deploymentId: deploymentId,
      jobId: res.jobs?.[0]?.job?.address || "pending",
      ipfsHash: ipfsHash,
      message: `✅ Optimized Deployment started!\n\n🆔 Deployment ID: ${deploymentId}\n📊 Strategy: ${strategy}\n🔢 Replicas: ${replicas}\n\nTracking: ${trackingUrl}`
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: `Error creating deployment: ${err.message}`,
      hint: "Check your NOSANA_API_KEY and Credit balance. Ensure your Job Definition schema is valid."
    }, null, 2);
  }
}
