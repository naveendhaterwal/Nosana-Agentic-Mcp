import { getNosanaClient } from "../nosana/client.js";
import { validatePath } from "./path_utils.js";
import fs from "fs";
import path from "path";

export type GpuTier = "cheapest" | "balanced" | "performance";
export type DurationChoice = "short" | "keep" | "custom";

/** Detect app type from project directory. */
export function detectAppType(projectPath: string): {
  type: "streamlit" | "fastapi" | "flask" | "python" | "unsupported";
  entryFile: string;
  requiresNewPython: boolean;
  requiresGpu: boolean;
} {
  const absPath = path.resolve(projectPath);

  if (!fs.existsSync(absPath)) {
    return { type: "unsupported", entryFile: "", requiresNewPython: false, requiresGpu: false };
  }

  const files = fs.readdirSync(absPath).map((f: string) => f.toLowerCase());
  let reqs = "";
  const reqFile = path.join(absPath, "requirements.txt");
  if (fs.existsSync(reqFile)) {
    reqs = fs.readFileSync(reqFile, "utf-8").toLowerCase();
  }

  const newPythonPkgs = ["numpy==2.", "numpy>=2", "pandas==2.", "pandas>=2", "scikit-learn==1.5", "scikit-learn==1.6", "scikit-learn>=1.5"];
  const requiresNewPython = newPythonPkgs.some((p) => reqs.includes(p));
  const requiresGpu = reqs.includes("torch") || reqs.includes("tensorflow") || reqs.includes("vllm") || reqs.includes("cuda");

  const subDirs = ["app", "src"].filter((d) => fs.existsSync(path.join(absPath, d)));
  const findEntryFile = (name: string): string | undefined => {
    if (files.includes(name)) return name;
    for (const sub of subDirs) {
      const subFiles = fs.readdirSync(path.join(absPath, sub)).map((f: string) => f.toLowerCase());
      if (subFiles.includes(name)) return `${sub}/${name}`;
    }
    return undefined;
  };

  const hasStreamlitFile = findEntryFile("streamlit_app.py") || findEntryFile("app.py");
  if (reqs.includes("streamlit") || (hasStreamlitFile && files.includes("requirements.txt"))) {
    const entry = findEntryFile("streamlit_app.py") ?? findEntryFile("app.py") ?? "app.py";
    return { type: "streamlit", entryFile: entry, requiresNewPython, requiresGpu };
  }

  if (reqs.includes("fastapi") || reqs.includes("uvicorn")) {
    const entry = files.find((f) => f === "main.py") ? "main.py" : files.find((f) => f === "app.py") ? "app.py" : "main.py";
    return { type: "fastapi", entryFile: entry, requiresNewPython, requiresGpu };
  }

  if (reqs.includes("flask")) {
    return { type: "flask", entryFile: "app.py", requiresNewPython, requiresGpu };
  }

  if (fs.existsSync(reqFile) || files.includes("main.py")) {
    const entry = files.includes("main.py") ? "main.py" : files.includes("app.py") ? "app.py" : "";
    return { type: "python", entryFile: entry, requiresNewPython, requiresGpu };
  }

  return { type: "unsupported", entryFile: "", requiresNewPython: false, requiresGpu: false };
}

/** Fetch live markets and return top 5 options with a recommendation. */
export async function getBucketedMarkets() {
  const client = getNosanaClient();
  if (!client.api) throw new Error("NOSANA_API_KEY required.");

  const liveMarkets = await client.api.markets.list();
  
  const markets = liveMarkets
    .filter((m: any) => m.type === "PREMIUM")
    .map((m: any) => ({
      name: m.name || m.slug || "Unknown GPU",
      address: m.address,
      priceUsdHr: m.usd_reward_per_hour || 0,
      memoryGb: m.lowest_vram || 8,
    }))
    .sort((a: any, b: any) => a.priceUsdHr - b.priceUsdHr);

  if (markets.length === 0) throw new Error("No GPU markets available right now.");

  // Get up to 5 options
  const options = markets.slice(0, 5);
  
  // Logic for recommendation: 
  // We recommend the cheapest option that has at least 16GB VRAM if available, 
  // otherwise we recommend the balanced middle option.
  let recommendedIndex = Math.floor(options.length / 2);
  const sixteenGbIndex = options.findIndex((m: any) => m.memoryGb >= 16);
  if (sixteenGbIndex !== -1) {
    recommendedIndex = sixteenGbIndex;
  }

  return { 
    options, 
    recommendedIndex,
    all: markets 
  };
}

/**
 * tool: get_deployment_options
 * description: [MANDATORY PRE-DEPLOYMENT GATE] Analyzes a project and returns GPU and Duration options.
 *              The AI must call this first and present these options to the user before deploying.
 */
export async function getDeploymentOptions(projectPath: string) {
  try {
    const { exists, absPath, errorResponse } = validatePath(projectPath);
    if (!exists) {
      return JSON.stringify(errorResponse, null, 2);
    }

    const app = detectAppType(absPath);
    if (app.type === "unsupported") {
      throw new Error("Could not detect a supported app type (Streamlit, FastAPI, Flask, etc.).");
    }

    const marketsResult = await getBucketedMarkets();
    const { options, recommendedIndex } = marketsResult;

    const gpuOptions = options.map((m: any, idx: number) => {
      const isRecommended = idx === recommendedIndex;
      const prefix = isRecommended ? "⭐ (RECOMMENDED) " : "";
      const icon = idx === 0 ? "🟢 " : (idx === options.length - 1 ? "🔴 " : "🟡 ");
      return {
        value: idx === 0 ? "cheapest" : (idx === options.length - 1 ? "performance" : "balanced"),
        // Note: For smart_deploy compatibility, we still map to the 3 tiers, but we show specific names.
        // If we want 5 distinct values, we'd need to update smart_deploy's GpuTier type.
        // For now, we'll label them clearly but map them to the closest tier or just pass the address.
        label: `${icon}${prefix}${m.name} (${m.memoryGb}GB) - $${m.priceUsdHr.toFixed(3)}/hr`
      };
    });

    return JSON.stringify({
      success: true,
      detectedApp: app.type,
      message: `Detected a **${app.type}** app. Before I can deploy, please choose your preferred GPU and duration from the options below.`,
      mandatory_questions: [
        {
          id: "gpuTier",
          question: "Which GPU would you like to select? (Showing top 5 local markets)",
          options: gpuOptions
        },
        {
          id: "duration",
          question: "How long would you like to deploy for?",
          options: [
            { value: "short", label: "⚡ Short test (60 minutes)" },
            { value: "keep", label: "🔄 Keep running (re-deploys automatically)" },
            { value: "custom", label: "⏱️ Custom duration (specify minutes)" }
          ]
        }
      ]
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message }, null, 2);
  }
}
