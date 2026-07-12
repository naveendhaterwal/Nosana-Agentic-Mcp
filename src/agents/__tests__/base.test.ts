import { describe, it, expect, vi } from "vitest";
import { BaseAgent } from "../base.js";
import { z } from "zod";

class TestAgent extends BaseAgent {
  name: any = "test_agent";
  displayName = "Test Agent";
  description = "A test agent";
  systemPrompt = "Test prompt";

  init() {
    this.registerTool(
      "test_tool",
      "A test tool",
      z.object({
        requiredParam: z.string(),
        optionalParam: z.number().optional(),
      }),
      async (args) => {
        return { success: true, received: args };
      }
    );
  }
}

describe("BaseAgent", () => {
  it("should generate proper MCP tool definitions from Zod schema", () => {
    const agent = new TestAgent();
    agent.init();
    
    const defs = agent.getMcpToolDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe("test_agent.test_tool");
    expect(defs[0].inputSchema).toHaveProperty("type", "object");
    expect(defs[0].inputSchema).toHaveProperty("properties");
    expect((defs[0].inputSchema as any).properties).toHaveProperty("requiredParam");
  });

  it("should execute tool successfully with valid parameters", async () => {
    const agent = new TestAgent();
    agent.init();

    const result = await agent.executeTool("test_agent.test_tool", { requiredParam: "hello", optionalParam: 42 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ success: true, received: { requiredParam: "hello", optionalParam: 42 } });
  });

  it("should fail validation and return clear error with invalid parameters", async () => {
    const agent = new TestAgent();
    agent.init();

    const result = await agent.executeTool("test_agent.test_tool", { optionalParam: 42 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.hint).toContain("requiredParam");
  });
});
