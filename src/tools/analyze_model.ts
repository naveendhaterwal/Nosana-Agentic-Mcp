import { validatePath } from "./path_utils.js";
import fs from "fs";
import path from "path";

export async function analyzeModel(modelPath: string) {
  const { exists, absPath, errorResponse } = validatePath(modelPath);
  if (!exists) {
    return JSON.stringify(errorResponse, null, 2);
  }

  const fullPath = absPath;
  let framework = "unknown";
  let recommendedVram = 16;
  let baseImage = "ubuntu:22.04";
  
  const reqPath1 = path.join(fullPath, "deploy-requirements.txt");
  const reqPath2 = path.join(fullPath, "requirements.txt");
  
  let reqs = "";
  if (fs.existsSync(reqPath1)) {
    reqs = fs.readFileSync(reqPath1, "utf-8").toLowerCase();
  } else if (fs.existsSync(reqPath2)) {
    reqs = fs.readFileSync(reqPath2, "utf-8").toLowerCase();
  }

  const files = fs.readdirSync(fullPath).map(f => f.toLowerCase());
  
  // Detection helpers
  const isPandas2 = reqs.includes("pandas==2") || reqs.includes("pandas>=2");
  const isNumpy2 = reqs.includes("numpy==2") || reqs.includes("numpy>=2");
  const needsPython311 = isPandas2 || isNumpy2 || reqs.includes("scikit-learn>=1.5");
  
  let entryFile = "main.py"; // default

  if (reqs.includes("streamlit")) {
    framework = "streamlit";
    baseImage = needsPython311 ? "python:3.11-slim" : "python:3.10-slim";
    recommendedVram = 8;
    entryFile = files.find(f => f.includes("streamlit_app.py")) || "streamlit_app.py";
  } else if (reqs.includes("fastapi") || reqs.includes("uvicorn")) {
    framework = "fastapi";
    baseImage = needsPython311 ? "python:3.11-slim" : "python:3.10-slim";
    recommendedVram = 8;
    entryFile = "main.py";
  } else if (reqs.includes("tensorflow") || reqs.includes("keras")) {
    framework = "tensorflow";
    baseImage = "docker.io/tensorflow/tensorflow:2.17.0-gpu-jupyter";
    recommendedVram = 16;
  } else if (reqs.includes("torch") || reqs.includes("pytorch")) {
    framework = "pytorch";
    baseImage = "pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime";
    recommendedVram = 12;
  } else if (reqs.includes("vllm") || reqs.includes("transformers") || reqs.includes("accelerate")) {
    framework = "vllm";
    baseImage = "docker.io/vllm/vllm-openai:latest";
    recommendedVram = 24;
  } else if (reqs.includes("scikit-learn") || reqs.includes("xgboost")) {
    framework = "scikit-learn";
    baseImage = needsPython311 ? "python:3.11-slim" : "python:3.10-slim";
    recommendedVram = 4;
  } else if (fs.existsSync(path.join(fullPath, "Dockerfile"))) {
    framework = "custom-docker";
    recommendedVram = 8;
  } else {
    throw new Error("Could not detect any known AI frameworks in requirements.txt. Ensure dependencies are listed.");
  }

  return JSON.stringify({
    mcp_version: "1.0.1-fixed-entrypoint-03/31-19:30",
    framework,
    recommendedVram,
    baseImage,
    entryFile,
    needsPython311,
    message: `Analyzed physical files at ${modelPath}. Detected Framework: ${framework.toUpperCase()}. Recommended VRAM: ${recommendedVram}GB. 
    
    💡 Optimization Note: Lightweight Scikit-learn/XGBoost models are primarily CPU-intensive. A ${recommendedVram}GB VRAM allocation is optimal to satisfy Nosana container overhead while maximizing your pool of available "Deep Market" nodes (RTX 3070/4090).`
  }, null, 2);
}
