import { z } from 'zod'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const Server = new McpServer(
  // Server identification
  { name: 'gdrive-server', version: '0.1.0' },
  // Server capabilities
  { capabilities: {
      tools: { listChanged: false },
      resources: {},
      prompts: {},
    }
  }
)

// Add tool implementations
Server.tool(
  'greet',
  { name: z // Define the input schema for the tool
    .string()
    .min(1)
    .describe('The name of the person to greet')
  },
  async ( input ) => { // Implement tool callback
    console.log(`Tool 'greet' called with name: ${input.name}`)
    return {
      content: [ { type: 'text', text: `Hello, ${input.name}! Welcome to Google Drive.` } ],
      // isError: false, // Default is false
    }
  }
)

export default Server
