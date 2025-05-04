#!/usr/bin/env node
// TypeScript schema validation
import { z } from 'zod';
// MCP server SDK
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const main = async () => {
    // 1. Create a new MCP server instance
    const Server = new McpServer(
    // Server identification
    {
        name: 'gdrive-server',
        version: '0.1.0',
    }, 
    // Server capabilities
    { capabilities: {
            tools: { listChanged: false },
            // resources: {}, // Uncomment to support resources
            // prompts: {}, // Uncomment to support prompts
        }
    });
    // 2. Add tool implementations
    Server.tool('greet', { name: z // 3. Define the input schema for the tool
            .string()
            .min(1)
            .describe('The name of the person to greet')
    }, async (input) => {
        console.log(`Tool 'greet' called with name: ${input.name}`);
        return {
            content: [{ type: 'text', text: `Hello, ${input.name}! Welcome to Google Drive.` }],
            // isError: false, // Default is false
        };
    });
    try {
        console.log('Starting server...');
        // 5. Connect to server, using stdio transport
        await Server.connect(new StdioServerTransport());
        console.log('Server started');
    }
    catch (error) {
        console.error(`Unhandled error in main: ${error}`);
        process.exit(1);
    }
};
await main();
