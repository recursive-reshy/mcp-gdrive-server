import fs from 'fs'
import dayjs from 'dayjs'

// Google
import { authenticate } from '@google-cloud/local-auth'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'


// TODO: This should probably be from the env file
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
]

// Helper function to authenticate with a timeout
const authenticateWithTimeout = async ( timeoutMs = 30000 ): Promise< OAuth2Client | null > => {

  // Typed as Promise<never> because it always rejects and never resolves.
  // This typing ensures type safety when using Promise.race.
  const timeoutPromise = new Promise< never >( ( _, reject ) =>
    setTimeout( () => reject( new Error('Authentication timed out') ), timeoutMs ),
  )

  console.error('Authenticating with timeout')

  // Returns a valid OAuth2 client Promise
  const authPromise = authenticate( {
    keyfilePath: 'gcp-oauth.keys.json',
    scopes: SCOPES,
  } )

  try {
    // Uses Promise.race to run both authPromise and timeoutPromise concurrently
    // Whichever promise settles first (either resolves or rejects) determines the outcome:
    // If authPromise resolves, it returns an OAuth2 client
    // If timeoutPromise rejects first (i.e., the authentication takes too long), the function catches the error, logs it, and returns null
    return await Promise.race( [ authPromise, timeoutPromise ] )
  } catch (error) {
    console.error( `Authentication with timeout failed: ${error}` )
    return null
  }
}

// Returns a valid OAuth2 client or null if authentication takes too long
const authenticateAndSaveCredentials = async (): Promise< OAuth2Client | null > => {
  console.log('Launching auth flow...')
  console.error('Attempting to load credentials from gcp-oauth.keys.json')

  // If no gcp-oauth.keys.json file exists return null
  if ( !fs.existsSync('gcp-oauth.keys.json') ) {
    console.error('No OAuth keys file found')
    return null
  }

  // Returns a valid OAuth2 client or null if authentication takes too long
  const auth = await authenticateWithTimeout()

  if ( !auth ) {
    console.error( 'Authentication failed' )
    return null
  }

  try {
    const { credentials } = await auth.refreshAccessToken()
    console.log(`Received new credentials with scopes: ${credentials.scope}`)

    // Write the client's credentials to their directory
    fs.writeFileSync(
      '.gdrive-server-credentials.json',
      JSON.stringify( credentials, null, 2 )
    )

    console.log('Credentials saved successfully with refresh token to: .gdrive-server-credentials.json')

    auth.setCredentials(credentials)
    return auth
  } catch (error) {
    console.error(`Unhandled error in authenticateAndSaveCredentials: ${error}`)
    return auth
  }
}

// Try to load credentials without prompting for auth
const loadCredentialsQuietly = async (): Promise< OAuth2Client | null > => {
  console.log('Attempting to load credentials from .gdrive-server-credentials.json')
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

    const timeToExpiryInMinutes = dayjs( savedCreds.expiry_date ).diff( dayjs(), 'minutes' )

    console.log('Token expiry status:', {
      expiryDate: dayjs( savedCreds.expiry_date ).format('DD-MM-YY HH:mm:ss'),
      timeToExpiryInMinutes: timeToExpiryInMinutes < 0 ? 'Expired' : timeToExpiryInMinutes,
      hasRefreshToken: !!savedCreds.refresh_token,
    } )

    // If the token is within 5 minutes of expiry and has a refresh token, refresh the token
    if ( dayjs( savedCreds.expiry_date ).diff( dayjs(), 'minutes') < ( 5 * 60 * 1000 ) && savedCreds.refresh_token ) {
      console.log('Attempting to refresh token using refresh_token')
      try {
        const response = await oauth2Client.refreshAccessToken()
        const newCreds = response.credentials
        fs.writeFileSync( '.gdrive-server-credentials.json', JSON.stringify( newCreds, null, 2 ) )
        oauth2Client.setCredentials(newCreds)
        console.log('Token refreshed and saved successfully')
      } catch (error) {
        console.error(`Failed to refresh token: ${error}`)
        return null
      }
    }

    return oauth2Client
  } catch (error) {
    console.error(`Unhandled error in loadCredentialsQuietly: ${error}`)
    return null
  }
}

// Background refresh that never prompts for auth
const refreshToken = () => {
  console.log('Setting up automatic token refresh interval (45 minutes)')
  return setInterval(
    async () => {
      try {
        console.error('Running scheduled token refresh check')
        const auth = await loadCredentialsQuietly()
        if (auth) {
          google.options( { auth } )
          console.error('Completed scheduled token refresh')
        } else {
          console.error('Skipping token refresh - no valid credentials')
        }
      } catch (error) {
        console.error(`Unhandled error in refreshToken: ${error}`)
      }
    },
    45 * 60 * 1000, // TODO: This should probably be from the env file
  )
}

export { 
  authenticateAndSaveCredentials,
  loadCredentialsQuietly,
  refreshToken,
}