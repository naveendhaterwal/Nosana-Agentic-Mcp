import { describe, it, expect } from "vitest";
import { classifyIntent, getAgentDirectory } from "../router.js";

describe("Router", () => {
  describe("classifyIntent", () => {
    it("should classify deploy intent correctly", async () => {
      const result = await classifyIntent("deploy my project");
      expect(result.agent).toBe("deployer");
      expect(result.intent).toBe("post_job");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify configurator intent correctly", async () => {
      const result = await classifyIntent("generate job config");
      expect(result.agent).toBe("configurator");
      expect(result.intent).toBe("generate_job_config");
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it("should classify diagnose intent correctly", async () => {
      const result = await classifyIntent("why did it fail");
      expect(result.agent).toBe("doctor");
      expect(result.intent).toBe("diagnose");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should fallback to deployer when unknown", async () => {
      const result = await classifyIntent("hello world");
      expect(result.agent).toBe("deployer");
      expect(result.intent).toBe("unknown");
      expect(result.confidence).toBe(0.3);
    });
  });

  describe("getAgentDirectory", () => {
    it("should return all 4 agents", () => {
      const directory = getAgentDirectory();
      expect(Object.keys(directory)).toEqual(["configurator", "deployer", "monitor", "doctor"]);
      expect(directory.configurator.tools.length).toBeGreaterThan(0);
    });
  });
});
