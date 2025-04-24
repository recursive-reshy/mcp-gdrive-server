#!/usr/bin/env node

import { authenticate } from "@google-cloud/local-auth";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getValidCredentials,
  setupTokenRefresh,
  loadCredentialsQuietly,
} from "./auth.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from 'url';

/**
 * TODOs:
 * - Add refresh token logic
 * 
 */

const drive = google.drive("v3");

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

// Returns a valid OAuth2 client or null
async function ensureAuth() {
  const auth = await getValidCredentials();
  google.options({ auth });
  return auth;
}

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  const pageSize = 10;
  const params: any = {
    pageSize,
    fields: "nextPageToken, files(id, name, mimeType)",
  };

  if (request.params?.cursor) {
    params.pageToken = request.params.cursor;
  }

  const res = await drive.files.list(params);
  const files = res.data.files!;

  return {
    resources: files.map((file) => ({
      uri: `gdrive:///${file.id}`,
      mimeType: file.mimeType,
      name: file.name,
    })),
    nextCursor: res.data.nextPageToken,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const fileId = request.params.uri.replace("gdrive:///", "");

  // First get file metadata to check mime type
  const file = await drive.files.get({
    fileId,
    fields: "mimeType",
  });

  // For Google Docs/Sheets/etc we need to export
  if (file.data.mimeType?.startsWith("application/vnd.google-apps")) {
    let exportMimeType: string;
    switch (file.data.mimeType) {
      case "application/vnd.google-apps.document":
        exportMimeType = "text/markdown";
        break;
      case "application/vnd.google-apps.spreadsheet":
        exportMimeType = "text/csv";
        break;
      case "application/vnd.google-apps.presentation":
        exportMimeType = "text/plain";
        break;
      case "application/vnd.google-apps.drawing":
        exportMimeType = "image/png";
        break;
      default:
        exportMimeType = "text/plain";
    }

    const res = await drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: "text" },
    );

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: exportMimeType,
          text: res.data,
        },
      ],
    };
  }

  // For regular files download content
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  const mimeType = file.data.mimeType || "application/octet-stream";
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: mimeType,
          text: Buffer.from(res.data as ArrayBuffer).toString("utf-8"),
        },
      ],
    };
  } else {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: mimeType,
          blob: Buffer.from(res.data as ArrayBuffer).toString("base64"),
        },
      ],
    };
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search for files in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const userQuery = request.params.arguments?.query as string;
    const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const formattedQuery = `fullText contains '${escapedQuery}'`;

    const res = await drive.files.list({
      q: formattedQuery,
      pageSize: 10,
      fields: "files(id, name, mimeType, modifiedTime, size)",
    });

    const fileList = res.data.files
      ?.map((file: any) => `${file.name} (${file.mimeType})`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${res.data.files?.length ?? 0} files:\n${fileList}`,
        },
      ],
      isError: false,
    };
  }
  throw new Error("Tool not found");
});

// Define credentials paths correctly using absolute paths
const credentialsPath = path.resolve(process.cwd(), ".gdrive-server-credentials.json");
const oauthKeysPath = path.resolve(process.cwd(), "gcp-oauth.keys.json");

async function authenticateAndSaveCredentials() {
  console.log("Launching auth flow...");
  console.log("Looking for OAuth keys at:", oauthKeysPath);
  
  try {
    // Check if the OAuth keys file exists
    if (!fs.existsSync(oauthKeysPath)) {
      console.error(`OAuth keys file not found at: ${oauthKeysPath}`);
      console.error("Please make sure you have placed your Google Cloud OAuth credentials file in the project root.");
      process.exit(1);
    }
    
    const auth = await authenticate({
      keyfilePath: oauthKeysPath,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    
    fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials, null, 2));
    console.log("Credentials saved successfully to:", credentialsPath);
    console.log("You can now run the server.");
    process.exit(0);
  } catch (error) {
    console.error("Authentication failed:", error);
    process.exit(1);
  }
}

async function loadCredentialsAndRunServer() {
  console.log('Loading credentials...', credentialsPath)
  
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found at:", credentialsPath,
      "\nPlease run with 'auth' argument first: node dist/index.js auth",
    );
    process.exit(1);
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
    const auth = new google.auth.OAuth2();
    auth.setCredentials(credentials);
    google.options({ auth });

    console.error("Credentials loaded. Starting server.");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // TODO: Add log informing that server is running
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// if (process.argv[2] === "auth") {
if (!fs.existsSync(".gdrive-server-credentials.json")) {
  authenticateAndSaveCredentials().catch(console.error);
} else {
  console.log('process.argv', process.argv)
  loadCredentialsAndRunServer().catch(console.error);
}

// async function startServer() {
//   try {
//     console.error("Starting server");
    
//     // Add this line to force authentication at startup
//     await ensureAuth(); // This will trigger the auth flow if no valid credentials exist
//     /**
//      * The stdio transport enables communication through standard input and output streams. This is particularly useful for local integrations and command-line tools.
//      * Use stdio when:
//      * - Building command-line tools
//      * - Implementing local integrations
//      * - Needing simple process communication
//      * - Working with shell scripts
//      */
//     const transport = new StdioServerTransport();
//     // 
//     await server.connect(transport);

//     // Set up periodic token refresh that never prompts for auth
//     setupTokenRefresh();
//   } catch (error) {
//     console.error("Error starting server:", error);
//     process.exit(1);
//   }
// }

// // Start server immediately
// startServer().catch(console.error);