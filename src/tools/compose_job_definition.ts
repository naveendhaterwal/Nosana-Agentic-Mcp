import fs from "fs";
import path from "path";
import { validatePath } from "./path_utils.js";

/**
 * tool: compose_job_definition
 * description: Intelligent Job Definition Architect for Nosana.
 *              Detects application type (Streamlit, FastAPI, etc.) and generates a valid JobDefinition JSON.
 */
export async function composeJobDefinition(
  projectPath: string,
  appType?: string,
  port: number = 8000,
  customImage?: string,
  entrypoint?: string[],
  cmd?: string[],
  env: Record<string, string> = {},
  workDir: string = "/workspace",
  requiredVram: number = 8,
  resourceUrl?: string
) {
  const { exists, absPath, errorResponse } = validatePath(projectPath);
  if (!exists) {
    return JSON.stringify(errorResponse, null, 2);
  }
  const absolutePath = absPath;
  
  let detectedType = appType || "custom";
  
  // 1. Auto-detection logic (if appType not provided)
  let reqs = "";
  const reqFile = path.join(absolutePath, "requirements.txt");
  if (fs.existsSync(reqFile)) {
    reqs = fs.readFileSync(reqFile, "utf-8").toLowerCase();
  }

  // Detect Python >= 3.11 requirement (e.g. numpy 2.x)
  const newPythonPkgs = ["numpy==2.", "numpy>=2", "pandas==2.", "pandas>=2", "scikit-learn==1.5", "scikit-learn>=1.5"];
  const requiresNewPython = newPythonPkgs.some(p => reqs.includes(p));
  const baseImg = customImage || "python:3.11-slim"; // Use 3.11 as a safe default

  const files = fs.readdirSync(absolutePath).map(f => f.toLowerCase());
  
  if (!appType) {
    if (reqs.includes("streamlit") || files.includes("streamlit_app.py") || files.includes("app.py")) {
      detectedType = "streamlit";
    } else if (reqs.includes("fastapi") || reqs.includes("uvicorn")) {
      detectedType = "fastapi";
    } else if (reqs.includes("flask")) {
      detectedType = "flask";
    }
  }

  const artUrl = resourceUrl || "__ARTIFACT_URL__";
  const fallbackUrl = artUrl.replace("ipfs.nosana.com", "cloudflare-ipfs.com");
  const ipfsIoUrl = artUrl.replace("ipfs.nosana.com", "ipfs.io");

  // Robust download script with retries and fallbacks
  const downloadScript = `attempt=1; while [ $attempt -le 3 ]; do echo "📦 Downloading artifact (attempt $attempt)..."; if curl -fL "${artUrl}" -o /tmp/app.tar.gz || curl -fL "${fallbackUrl}" -o /tmp/app.tar.gz || curl -fL "${ipfsIoUrl}" -o /tmp/app.tar.gz; then break; fi; echo "❌ Download failed."; if [ $attempt -lt 3 ]; then echo "Wait 10s and retry..."; sleep 10; else echo "❌ All attempts failed. Exiting."; exit 1; fi; attempt=$((attempt + 1)); done`;

  if (detectedType === "streamlit") {
    const subDirs = ["app", "src"].filter((d) => fs.existsSync(path.join(absolutePath, d)));
    const findEntryFile = (name: string): string | undefined => {
      if (files.includes(name)) return name;
      for (const sub of subDirs) {
        const subFiles = fs.readdirSync(path.join(absolutePath, sub)).map((f) => f.toLowerCase());
        if (subFiles.includes(name)) return `${sub}/${name}`;
      }
      return undefined;
    };
    const entryFile = findEntryFile("streamlit_app.py") || findEntryFile("app.py") || "app.py";
    const schema = {
      version: "0.1",
      type: "container",
      meta: {
        trigger: "cli",
        system_resources: { required_vram: requiredVram },
        app_type: "streamlit"
      },
      ops: [{
        id: "streamlit-ui",
        type: "container/run",
        args: {
          image: baseImg,
          gpu: true,
          entrypoint: ["/bin/sh", "-c"],
          cmd: [`set -eu; echo "🚀 Starting Nosana Container..."; (command -v curl >/dev/null && command -v tar >/dev/null) || (apt-get update && apt-get install -y curl ca-certificates tar); mkdir -p /workspace/app && ${downloadScript} && echo "📂 Extracting..."; tar -xzf /tmp/app.tar.gz -C /workspace/app && cd /workspace/app && echo "🐍 Installing dependencies (this may take 2-4 mins)..."; pip install --no-cache-dir --upgrade pip && (if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi) && echo "✨ Starting Streamlit UI on port 8000..."; exec python -m streamlit run ${entryFile} --server.port ${port} --server.address 0.0.0.0 --server.headless true`],
          work_dir: "/workspace",
          expose: [{ port: port, type: "web" }],
          env: { PORT: port.toString(), TERM: "xterm" }
        }
      }]
    };
    return JSON.stringify(schema, null, 2);
  }

  // 2. Base Templates (for others)
  let runCmd: string;
  let finalExposeType = "api";
  let finalEntrypoint = entrypoint || ["/bin/sh", "-c"];

  if (detectedType === "fastapi") {
    const entry = files.includes("main.py") ? "main.py" : "app.py";
    runCmd = `uvicorn ${entry.replace(".py", "")}:app --host 0.0.0.0 --port ${port}`;
  } else if (detectedType === "flask") {
    runCmd = `python app.py`;
  } else if (detectedType === "jupyter") {
    runCmd = `jupyter lab --ip=0.0.0.0 --port=${port} --no-browser --allow-root --ServerApp.token='' --ServerApp.password=''`;
    finalExposeType = "web";
  } else if (detectedType === "ollama") {
    runCmd = `ollama serve`;
  } else {
    runCmd = cmd ? cmd.join(" && ") : "python main.py";
  }

  const jobDefinition: any = {
    version: "0.1",
    type: "container",
    meta: {
      trigger: "api",
      system_resources: { required_vram: requiredVram },
      app_type: detectedType
    },
    ops: [{
      id: detectedType,
      type: "container/run",
      args: {
        image: baseImg,
        gpu: detectedType !== "fastapi", // Only GPU for non-API types usually or as requested
        entrypoint: finalEntrypoint,
        cmd: [`set -eu; (command -v curl >/dev/null && command -v tar >/dev/null) || (apt-get update && apt-get install -y curl ca-certificates tar); mkdir -p /workspace/app && ${downloadScript} && echo "📂 Extracting..."; tar -xzf /tmp/app.tar.gz -C /workspace/app && cd /workspace/app && pip install --no-cache-dir --upgrade pip && (if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi) && exec ${runCmd}`],
        work_dir: "/workspace",
        expose: [{ port: port, type: finalExposeType }],
        env: { ...(env || {}), PORT: port.toString(), TERM: "xterm" }
      }
    }]
  };

  return JSON.stringify(jobDefinition, null, 2);
}
