import { google } from 'googleapis';
import { oauth2Client } from './auth.js';
import fs from 'fs';

// Initialize the Google Drive API
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
            : `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;

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
 * @param {string} fileName - Name of the file in Google Drive
 * @param {string} [parentFolderId=null] - ID of the parent folder (optional)
 * @returns {Promise<string>} - File ID of the uploaded file
 */
async function uploadFile(filePath, fileName, parentFolderId = null) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Source file not found: ${filePath}`);
        }

        console.log(`\nUploading file: ${filePath}`);
        console.log('File size:', fs.statSync(filePath).size, 'bytes');

        if (parentFolderId) {
            console.log('Using provided parent folder ID');
        }

        const fileMetadata = {
            name: fileName,
            ...(parentFolderId && { parents: [parentFolderId] })
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

export { uploadFile, downloadFile, createOrGetFolder };
