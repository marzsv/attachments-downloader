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
const TOKEN_PATH = path.join(__dirname, 'token.json');

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
    scope: 'https://www.googleapis.com/auth/drive.file',
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

const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Creates a folder in Google Drive if it doesn't exist
 * @param {string} folderName - Name of the folder to create
 * @param {string} [parentId] - ID of the parent folder (optional)
 * @returns {Promise<string>} - Folder ID
 */
async function createOrGetFolder(folderName, parentId = null) {
    try {
        // Check if folder already exists
        const query = parentId
            ? `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
            : `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        // Return existing folder ID if found
        if (response.data.files.length > 0) {
            console.log(`Found existing folder: ${folderName}`);
            return response.data.files[0].id;
        }

        // Create new folder if not found
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId && { parents: [parentId] })
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        console.log(`Created new folder: ${folderName}`);
        return folder.data.id;
    } catch (error) {
        console.error('Error creating/getting folder:', error.message);
        throw error;
    }
}

/**
 * Uploads a file to Google Drive
 * @param {string} filePath - Path to the file to upload
 * @param {string} destination - Destination path in Google Drive (e.g., 'folder/subfolder/file.jpg')
 * @returns {Promise<string>} - File ID of the uploaded file
 */
async function uploadFile(filePath, destination) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Source file not found: ${filePath}`);
        }

        console.log(`\nUploading file: ${filePath}`);
        console.log('File size:', fs.statSync(filePath).size, 'bytes');

        // Parse the destination path
        const parts = destination.split('/').filter(Boolean);
        const fileName = parts.pop(); // Get the file name
        let parentId = null;

        // Create folder structure if needed
        if (parts.length > 0) {
            for (const folderName of parts) {
                parentId = await createOrGetFolder(folderName, parentId);
            }
            console.log('Folder structure created/verified');
        }

        const fileMetadata = {
            name: fileName,
            ...(parentId && { parents: [parentId] })
        };

        const media = {
            mimeType: 'application/octet-stream',
            body: fs.createReadStream(filePath),
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink',
        });

        console.log('\nUpload successful!');
        console.log('File ID:', response.data.id);
        console.log('File name:', response.data.name);
        console.log('View in browser:', response.data.webViewLink);

        return response.data.id;
    } catch (error) {
        console.error('\nError uploading file:', error.message);
        if (error.response) {
            console.error('Error details:', error.response.data);
        }
        throw error;
    }
}

/**
 * Downloads a file from Google Drive
 * @param {string} fileId - ID of the file to download
 * @param {string} destPath - Path where the file should be saved
 * @returns {Promise<void>}
 */
async function downloadFile(fileId, destPath) {
    try {
        console.log(`\nDownloading file with ID: ${fileId}`);
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
        }, { responseType: 'stream' });

        const dest = fs.createWriteStream(destPath);

        return new Promise((resolve, reject) => {
            response.data
                .on('end', () => {
                    console.log(`File downloaded successfully to: ${destPath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Error downloading file:', err);
                    reject(err);
                })
                .pipe(dest);
        });
    } catch (error) {
        console.error('Error downloading file:', error.message);
        if (error.response) {
            console.error('Error details:', error.response.data);
        }
        throw error;
    }
}

export { getAccessToken, uploadFile, downloadFile };
