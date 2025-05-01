import { google } from 'googleapis';
import { oauth2Client, getAccessToken } from '../drive/auth.js';

/**
 * Get list of emails from Gmail
 * @param {number} maxResults - Maximum number of emails to retrieve
 * @returns {Promise<Array>} List of emails
 */
export async function getEmails(maxResults = 10) {
    try {
        // Ensure we have valid credentials
        await getAccessToken();

        // Create Gmail API client
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Get list of messages
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: maxResults
        });

        const messages = response.data.messages || [];
        const emails = [];

        // Get details for each message
        for (const message of messages) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
            });

            const headers = email.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
            const date = headers.find(h => h.name === 'Date')?.value || 'No Date';

            emails.push({
                id: message.id,
                subject,
                from,
                date,
                snippet: email.data.snippet
            });
        }

        return emails;
    } catch (error) {
        console.error('Error fetching emails:', error);
        throw error;
    }
}

/**
 * Get a specific email by ID
 * @param {string} messageId - The ID of the email to retrieve
 * @returns {Promise<Object>} The email details
 */
export async function getEmailById(messageId) {
    try {
        await getAccessToken();
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        return response.data;
    } catch (error) {
        console.error('Error fetching email:', error);
        throw error;
    }
}
