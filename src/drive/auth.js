import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import url from 'url';
import open from 'open';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path for storing tokens
const TOKEN_PATH = path.join(__dirname, '../../token.json');

// Verify required environment variables
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error(`
    Error: Missing required environment variables!

    Please create a .env file in the project root with the following variables:
    ${missingEnvVars.map(varName => `${varName}="your-value-here"`).join('\n    ')}

    You can use .env.example as a template.
    `);
    process.exit(1);
}

// OAuth2 credentials
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

/**
 * Load saved credentials if they exist
 * @returns {Promise<boolean>} true if valid credentials were loaded
 */
async function loadSavedCredentialsIfExist() {
    try {
        if (fs.existsSync(TOKEN_PATH)) {
            const content = fs.readFileSync(TOKEN_PATH, 'utf-8');
            const credentials = JSON.parse(content);
            oauth2Client.setCredentials(credentials);

            // Verify if token is still valid
            try {
                const drive = google.drive({ version: 'v3', auth: oauth2Client });
                await drive.files.list({ pageSize: 1 });
                console.log('Using saved credentials');
                return true;
            } catch (error) {
                console.log('Saved credentials are invalid, will refresh');
                return false;
            }
        }
    } catch (err) {
        console.log('No valid saved credentials found');
        return false;
    }
    return false;
}

/**
 * Save credentials to file
 * @param {Object} tokens The tokens to save
 */
function saveCredentials(tokens) {
    try {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
    } catch (err) {
        console.error('Error saving credentials:', err);
    }
}

// Generate the url that will be used for authorization
const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/gmail.readonly'
    ],
    prompt: 'consent',
    include_granted_scopes: true
});

/**
 * Get OAuth2 tokens using local server
 * @returns {Promise<void>}
 */
async function getAccessToken() {
    // First try to load saved credentials
    if (await loadSavedCredentialsIfExist()) {
        return;
    }

    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const queryObject = url.parse(req.url, true).query;

                if (queryObject.error) {
                    const errorMessage = `Authentication error: ${queryObject.error}`;
                    console.error(errorMessage);
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`
                        <h1>Authentication Error</h1>
                        <p>${errorMessage}</p>
                        <p>Please make sure:</p>
                        <ul>
                            <li>You are using a test user email that was added to the OAuth consent screen</li>
                            <li>You accepted all required permissions</li>
                        </ul>
                        <p>You can close this window and try again.</p>
                    `);
                    server.close();
                    reject(new Error(errorMessage));
                    return;
                }

                if (queryObject.code) {
                    const { tokens } = await oauth2Client.getToken(queryObject.code);
                    oauth2Client.setCredentials(tokens);

                    // Save the tokens for future use
                    saveCredentials(tokens);

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <h1>Authentication Successful!</h1>
                        <p>You have successfully authenticated with Google Drive.</p>
                        <p>Your credentials have been saved - you won't need to authenticate again.</p>
                        <p>You can close this window now.</p>
                    `);
                    server.close();
                    resolve();
                }
            } catch (error) {
                console.error('Token Error:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`
                    <h1>Authentication Failed</h1>
                    <p>Error: ${error.message}</p>
                    <p>Please check the console for more details.</p>
                `);
                server.close();
                reject(error);
            }
        }).listen(3000, () => {
            console.log('\nOpening browser for authentication...');
            console.log('NOTE: You will only need to do this once.');
            open(authorizeUrl);
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error('\nError: Port 3000 is already in use.');
                console.log('Please make sure no other authentication process is running.');
            } else {
                console.error('\nServer error:', error);
            }
            reject(error);
        });
    });
}

// Initialize the Google Drive API with auto token refresh
oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
        saveCredentials(tokens);
    }
});

export { oauth2Client, getAccessToken };
