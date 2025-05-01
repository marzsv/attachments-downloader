import { getAccessToken } from './src/drive/auth.js';
import { uploadFile, downloadFile } from './src/drive/files.js';

async function main() {
    try {
        console.log('Starting Google Drive operations...');

        // First, authenticate with Google
        console.log('\nAuthenticating with Google...');
        await getAccessToken();

        const fileToUpload = '/Users/mario/Downloads/image2.png';
        console.log('\nCurrent working directory:', process.cwd());

        // Upload a file
        console.log('\n=== Uploading File ===');
        const fileId = await uploadFile(fileToUpload, 'test/image2.png');

        // Download the same file
        // console.log('\n=== Downloading File ===');
        // await downloadFile(fileId, 'downloaded_image2.png');

        console.log('\nAll operations completed successfully!');
    } catch (error) {
        console.error('\nAn error occurred:', error.message);
        if (error.response) {
            console.error('Error details:', error.response.data);
        }
    }
}

// Run the main function
main().catch(console.error);



