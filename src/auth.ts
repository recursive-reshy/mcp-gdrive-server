import fs from 'fs'
import path from 'path'

// Google
import { authenticate } from '@google-cloud/local-auth'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
]

// Get credentials directory from environment variable or use default
const CREDS_DIR =
  process.env.GDRIVE_CREDS_DIR ||
  path.join( path.dirname( new URL(import.meta.url).pathname ), '../../../' )

// Client auth tokens
const credentialsPath = path.join( CREDS_DIR, '.gdrive-server-credentials.json' )

// Ensure the credentials directory exists
function ensureCredsDirectory() {
  try {
    fs.mkdirSync(CREDS_DIR, { recursive: true });
    // The recursive: true option ensures that parent directories are CREATED if 
    // they do not exist, and avoids errors if the directory already exists.
    console.error(`Ensured credentials directory exists at: ${CREDS_DIR}`);
  } catch (error) {
    console.error(
      `Failed to create credentials directory: ${CREDS_DIR}`,
      error,
    );
    throw error;
  }
}

async function authenticateWithTimeout(
  keyfilePath: string,
  SCOPES: string[],
  timeoutMs = 30000,
): Promise<any | null> {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Authentication timed out")), timeoutMs),
  );

  console.log('Authenticating with timeout', keyfilePath)

  // Returns a valid OAuth2 client Promise
  const authPromise = authenticate({
    keyfilePath: 'gcp-oauth.keys.json',
    scopes: SCOPES,
  });

  try {
    // Uses Promise.race to run both authPromise and timeoutPromise concurrently
    // Whichever promise settles first (either resolves or rejects) determines the outcome:
    // If authPromise resolves, it returns an OAuth2 client
    // If timeoutPromise rejects first (i.e., the authentication takes too long), the function catches the error, logs it, and returns null
    return await Promise.race([authPromise, timeoutPromise]);
  } catch (error) {
    console.error('Authentication with timeout failed', error);
    return null;
  }
}

// Returns a valid OAuth2 client or null if authentication takes too long
const authenticateAndSaveCredentials = async (): Promise< OAuth2Client | null > => {
  console.log('Launching auth flow...')
  console.log(`Using credentials path: ${credentialsPath}`)

  //This file path needs to be from the server side
  const keyfilePath = path.join( CREDS_DIR, 'gcp-oauth.keys.json' )
  console.log(`Using keyfile path: ${keyfilePath}`)

  // Returns a valid OAuth2 client or null if authentication takes too long
  const auth = await authenticateWithTimeout( keyfilePath, SCOPES )

  try {
    const { credentials } = await auth.refreshAccessToken()
    console.log(`Received new credentials with scopes: ${credentials.scope}`)

    // Ensure directory exists before saving, throws an error otherwise
    // TODO: I dont think this is needed, 
    // Since the file is on the root of the clients side
    // The directory will always exist
    // ensureCredsDirectory()

    // Write the client's credentials to their directory
    console.log(`Using credentials path: ${credentialsPath}`)
    fs.writeFileSync(
      '.gdrive-server-credentials.json',
      JSON.stringify( credentials, null, 2 )
    )

    console.log(`Credentials saved successfully with refresh token to: ${credentialsPath}`)

    auth.setCredentials(credentials)
    return auth
  } catch (error) {
    console.error(`Error refreshing token during initial auth: ${error}`)
    return auth
  }
}

// Try to load credentials without prompting for auth
const loadCredentialsQuietly = async (): Promise< OAuth2Client | null > => {
  console.log(`Attempting to load credentials from: ${credentialsPath}`)
  // If no .gdrive-server-credentials.json file exists return null
  if ( !fs.existsSync('.gdrive-server-credentials.json') ) {
    console.error('No credentials file found')
    return null
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
    )

    const savedCreds = JSON.parse( fs.readFileSync( '.gdrive-server-credentials.json', 'utf-8' ) )
    console.log(`Loaded existing credentials with scopes: ${savedCreds.scope}`)
    
    oauth2Client.setCredentials(savedCreds)

    const expiryDate = new Date(savedCreds.expiry_date)
    const now = new Date()
    const fiveMinutes = 5 * 60 * 1000
    const timeToExpiry = expiryDate.getTime() - now.getTime()

    console.log('Token expiry status:', {
      expiryDate: expiryDate.toISOString(),
      timeToExpiryMinutes: Math.floor(timeToExpiry / (60 * 1000)),
      hasRefreshToken: !!savedCreds.refresh_token,
    })

    if (timeToExpiry < fiveMinutes && savedCreds.refresh_token) {
      console.log('Attempting to refresh token using refresh_token')
      try {
        const response = await oauth2Client.refreshAccessToken()
        const newCreds = response.credentials
        ensureCredsDirectory()
        fs.writeFileSync('.gdrive-server-credentials.json', JSON.stringify(newCreds, null, 2))
        oauth2Client.setCredentials(newCreds)
        console.log('Token refreshed and saved successfully')
      } catch (error) {
        console.error(`Failed to refresh token: ${error}`)
        return null
      }
    }

    return oauth2Client
  } catch (error) {
    console.error(`Error loading credentials: ${error}`)
    return null
  }
}

// Returns a valid OAuth2 client or null
// Get valid credentials, prompting for auth if necessary
export async function getValidCredentials(forceAuth = false) {
  if (!forceAuth) {
    // Returns a valid OAuth2 client or null
    const quietAuth = await loadCredentialsQuietly();
    if (quietAuth) {
      return quietAuth;
    }
  }

  // Returns a valid OAuth2 client or null
  return await authenticateAndSaveCredentials();
}

// Background refresh that never prompts for auth
export function setupTokenRefresh() {
  console.error("Setting up automatic token refresh interval (45 minutes)");
  return setInterval(
    async () => {
      try {
        console.error("Running scheduled token refresh check");
        const auth = await loadCredentialsQuietly();
        if (auth) {
          google.options({ auth });
          console.error("Completed scheduled token refresh");
        } else {
          console.error("Skipping token refresh - no valid credentials");
        }
      } catch (error) {
        console.error("Error in automatic token refresh:", error);
      }
    },
    45 * 60 * 1000,
  );
}

export { 
  authenticateAndSaveCredentials,
  loadCredentialsQuietly,
}