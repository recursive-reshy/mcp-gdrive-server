#!/usr/bin/env node
import 'dotenv/config'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { authenticateAndSaveCredentials, loadCredentialsQuietly, refreshToken } from './auth.js'

import McpServer from './mcpServer.js'

const main = async () => {

  try {
    // GDrive authentication
    console.log('Authenticating...')
    const quietAuth = await loadCredentialsQuietly()
    // If crendentials do not exist or are expired, authenticate and save credentials
    if ( !quietAuth ) {
      await authenticateAndSaveCredentials()
    }
    console.log('Authenticated')

    // Start sever
    console.log('Starting MCP server...')
    await McpServer.connect( new StdioServerTransport() )

    // Periodically refresh the token
    refreshToken()
    console.log('MCP server started')
  } catch (error) {
    console.error(`Unhandled error in main: ${error}`)
    process.exit(1)
  }
}

await main()