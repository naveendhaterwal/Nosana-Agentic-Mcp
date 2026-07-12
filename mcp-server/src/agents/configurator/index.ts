import { z } from "zod";
import { BaseAgent } from "../base.js";
import { logger } from "../../logger.js";
import type { AgentName } from "../../types.js";

export class ConfiguratorAgent extends BaseAgent {
  readonly name: AgentName = "configurator";
  readonly displayName = "⚙️ Configurator";
  readonly description = "Expert Configurator. Your job is to generate the JSON Job Definition required to run Docker containers on the Nosana network.";
  readonly systemPrompt = `You are the Configurator agent. Your job is to generate raw JSON Nosana job configurations based on the Docker image and requirements.`;

  init(): void {
    this.registerTool(
      "generate_job_config",
      "Generate a raw JSON Nosana job configuration for a specific Docker image.",
      z.object({
        imageName: z.string().describe("The full Docker image name (e.g. docker.io/username/app:latest)"),
        port: z.number().describe("The internal port exposed by the application (e.g. 8000, 3000)"),
        requiredVram: z.number().describe("Required GPU VRAM in GB (e.g. 8, 16, 24)"),
      }),
      async (args, ctx) => {
        const { imageName, port, requiredVram } = args;

        const jobConfig = {
          version: "0.1",
          type: "container",
          meta: {
            trigger: "cli",
            system_resources: { required_vram: requiredVram },
          },
          ops: [
            {
              id: "run-app",
              type: "container/run",
              args: {
                image: imageName,
                gpu: true,
                expose: [{ port: port, type: "web" }],
                env: { PORT: port.toString() },
              },
            },
          ],
        };

        logger.info(`⚙️ Generated Job Config for ${imageName}`);

        return {
          success: true,
          message: "Successfully generated Nosana Job Configuration.",
          config: jobConfig,
          rawJson: JSON.stringify(jobConfig, null, 2),
        };
      }
    );

    this.registerTool(
      "validate_job_config",
      "Validate a raw JSON Nosana job configuration to ensure it conforms to the schema.",
      z.object({
        jobJson: z.string().describe("The raw JSON string representing the Job Definition"),
      }),
      async (args, ctx) => {
        const { jobJson } = args;
        let jobDefinition;
        
        try {
          jobDefinition = JSON.parse(jobJson);
        } catch (e) {
          return {
            success: false,
            message: "Invalid JSON provided. Could not parse.",
            errors: [(e as Error).message],
          };
        }

        // We can use the SDK's validateJobDefinition if available, 
        // but since @nosana/sdk might need to be imported at the top, let's import it there.
        // Wait, I need to add import { validateJobDefinition } from "@nosana/sdk"; at the top of the file.
        // Let me just import it dynamically here to save space or I will do a multi_replace instead.
        const { validateJobDefinition } = await import("@nosana/sdk");
        const validation = validateJobDefinition(jobDefinition);

        if (!validation.success) {
          logger.warn(`⚙️ Validation failed for Job Config`, { errors: validation.errors });
          return {
            success: false,
            message: "Job definition validation failed.",
            errors: validation.errors,
          };
        }

        logger.info(`⚙️ Validated Job Config successfully`);
        return {
          success: true,
          message: "Valid Job Definition.",
        };
      }
    );
  }
}
