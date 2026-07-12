import fs from "fs";
import path from "path";

/**
 * Validates if a path exists and provides diagnostic info if it's missing.
 * This helps identify when an MCP server is running in a sandbox 
 * and cannot access host-level paths like /home/claude or /tmp.
 */
export function validatePath(requestedPath: string): { 
  exists: boolean; 
  absPath: string; 
  errorResponse?: any 
} {
  if (!requestedPath) {
    return { 
      exists: false, 
      absPath: "", 
      errorResponse: { success: false, error: "Missing path parameter." } 
    };
  }

  const absPath = path.resolve(requestedPath);
  if (fs.existsSync(absPath)) {
    return { exists: true, absPath };
  }

  // Not found - gather diagnostics for the sandbox
  const cwd = process.cwd();
  const parent = path.dirname(absPath);
  let parentContent: string[] = [];
  try {
    if (fs.existsSync(parent)) {
      parentContent = fs.readdirSync(parent);
    }
  } catch {}

  let rootContent: string[] = [];
  try {
    rootContent = fs.readdirSync('.');
  } catch {}

  return {
    exists: false,
    absPath,
    errorResponse: {
      success: false,
      error: "🚫 Path Inaccessible",
      message: "The Nosana tool cannot find or access this path. This is a common limitation of MCP sandboxing.",
      diagnostics: {
        attemptedPath: absPath,
        serverWorkingDir: cwd,
        parentDirectoryExists: fs.existsSync(parent),
        visibleFilesInRoot: rootContent.slice(0, 15),
        visibleFilesInParent: parentContent.slice(0, 15),
      },
      hint: "Ensure the path is within the server's current working directory or use a path relative to the nosana-deploy folder. You (Claude) may need to move the project files into the nosana-deploy workspace first."
    }
  };
}
