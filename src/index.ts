#!/usr/bin/env node
import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import Server from "./server.js"

const main = async () => {

  try {
    console.log('Starting server...', process.env.CLIENT_SECRET)
    await Server.connect( new StdioServerTransport() )
    console.log('Server started')
  } catch (error) {
    console.error(`Unhandled error in main: ${error}`)
    process.exit(1)
  }
}

await main()
