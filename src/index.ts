#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import Server from "./server.js"

const main = async () => {

  try {
    console.log('Starting server...')
    await Server.connect( new StdioServerTransport() )
    console.log('Server started')
  } catch (error) {
    console.error(`Unhandled error in main: ${error}`)
    process.exit(1)
  }
}

await main()
