import { getEmails, getEmailById } from './src/gmail/email.js';
import { google } from 'googleapis';
import { oauth2Client, getAccessToken } from './src/drive/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
    .option('month', {
        alias: 'm',
        description: 'Month to fetch emails from (1-12)',
        type: 'number',
        demandOption: true
    })
    .option('year', {
        alias: 'y',
        description: 'Year to fetch emails from',
        type: 'number',
        default: new Date().getFullYear()
    })
    .check((argv) => {
        if (argv.month < 1 || argv.month > 12) {
            throw new Error('Month must be between 1 and 12');
        }
        return true;
    })
    .help()
    .alias('help', 'h')
    .argv;

// Configuration options
const config = {
    createSubfolders: false, // Set to true to create a subfolder for each email
    baseAttachmentsDir: path.join(__dirname, 'attachments')
};

// Create base attachments directory if it doesn't exist
if (!fs.existsSync(config.baseAttachmentsDir)) {
    fs.mkdirSync(config.baseAttachmentsDir);
}

// Create year-month directory
const yearMonthDir = path.join(config.baseAttachmentsDir, `${argv.year}-${String(argv.month).padStart(2, '0')}`);
if (!fs.existsSync(yearMonthDir)) {
    fs.mkdirSync(yearMonthDir);
}

// Update attachments directory in config
config.attachmentsDir = yearMonthDir;

/**
 * Checks if an email has attachments
 * @param {Object} email - The email object
 * @returns {boolean} - True if the email has attachments
 */
function hasAttachments(email) {
    if (!email.payload.parts) return false;
    return email.payload.parts.some(part => part.filename && part.body.attachmentId);
}

/**
 * Checks if an attachment is a JSON file
 * @param {Object} part - The email part containing the attachment
 * @returns {boolean} - True if the attachment is a JSON file
 */
function isJsonAttachment(part) {
    if (!part.filename) return false;
    return part.filename.toLowerCase().endsWith('.json');
}

/**
 * Checks if an attachment is a PDF file
 * @param {Object} part - The email part containing the attachment
 * @returns {boolean} - True if the attachment is a PDF file
 */
function isPdfAttachment(part) {
    if (!part.filename) return false;
    return part.filename.toLowerCase().endsWith('.pdf');
}

/**
 * Checks if an email has JSON attachments
 * @param {Object} email - The email object
 * @returns {boolean} - True if the email has JSON attachments
 */
function hasJsonAttachments(email) {
    if (!email.payload.parts) return false;
    return email.payload.parts.some(part => isJsonAttachment(part) && part.body.attachmentId);
}

/**
 * Checks if an email has PDF attachments
 * @param {Object} email - The email object
 * @returns {boolean} - True if the email has PDF attachments
 */
function hasPdfAttachments(email) {
    if (!email.payload.parts) return false;
    return email.payload.parts.some(part => isPdfAttachment(part) && part.body.attachmentId);
}

/**
 * Checks if an email has JSON or PDF attachments
 * @param {Object} email - The email object
 * @returns {boolean} - True if the email has JSON or PDF attachments
 */
function hasJsonOrPdfAttachments(email) {
    return hasJsonAttachments(email) || hasPdfAttachments(email);
}

/**
 * Downloads attachments from an email
 * @param {Object} email - The email object containing attachments
 * @param {string} emailId - The ID of the email
 */
async function downloadAttachments(email, emailId) {
    if (!hasAttachments(email)) {
        console.log('No attachments found in this email');
        return;
    }

    let attachmentCount = 0;
    let emailDir = config.attachmentsDir;

    // Create email subfolder if configured
    if (config.createSubfolders) {
        emailDir = path.join(config.attachmentsDir, emailId);
        if (!fs.existsSync(emailDir)) {
            fs.mkdirSync(emailDir);
        }
    }

    for (const part of email.payload.parts) {
        if (part.filename && part.body.attachmentId) {
            const attachmentId = part.body.attachmentId;

            // If not using subfolders, prefix the filename with email ID to avoid conflicts
            const filename = config.createSubfolders
                ? part.filename
                : `${emailId}_${part.filename}`;

            const attachmentPath = path.join(emailDir, filename);
            console.log(`Downloading attachment: ${filename}`);

            try {
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                const response = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: emailId,
                    id: attachmentId
                });

                const fileData = Buffer.from(response.data.data, 'base64');
                fs.writeFileSync(attachmentPath, fileData);
                console.log(`Saved attachment to: ${attachmentPath}`);
                attachmentCount++;
            } catch (error) {
                console.error(`Error downloading attachment ${filename}:`, error.message);
            }
        }
    }

    // Remove empty subfolder if no attachments were downloaded
    if (config.createSubfolders && attachmentCount === 0 && emailDir !== config.attachmentsDir) {
        fs.rmdirSync(emailDir);
    }
}

/**
 * Gets all emails with attachments within a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Array of emails
 */
async function getEmailsInDateRange(startDate, endDate) {
    const allEmails = [];
    let pageToken = null;
    let hasMore = true;

    while (hasMore) {
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 100,
                pageToken: pageToken,
                q: `has:attachment after:${Math.floor(startDate.getTime() / 1000)} before:${Math.floor(endDate.getTime() / 1000)}`
            });

            const messages = response.data.messages || [];
            allEmails.push(...messages);

            pageToken = response.data.nextPageToken;
            hasMore = !!pageToken;

            if (messages.length === 0) {
                hasMore = false;
            }
        } catch (error) {
            console.error('Error fetching emails:', error.message);
            hasMore = false;
        }
    }

    return allEmails;
}

async function main() {
    try {
        // Ensure we have valid credentials
        await getAccessToken();

        // Calculate start and end dates based on provided month and year
        const startDate = new Date(argv.year, argv.month - 1, 1, 0, 0, 0);
        const endDate = new Date(argv.year, argv.month, 0, 23, 59, 59);

        console.log(`Obteniendo emails de ${startDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}...`);
        const messages = await getEmailsInDateRange(startDate, endDate);

        console.log(`Se encontraron ${messages.length} emails en ${startDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`);

        let processedEmails = 0;
        let emailsWithJsonAttachments = 0;

        // Process each email
        for (const message of messages) {
            processedEmails++;
            console.log(`\nProcesando email ${processedEmails}/${messages.length}`);

            try {
                const fullEmail = await getEmailById(message.id);
                if (hasJsonAttachments(fullEmail)) {
                    emailsWithJsonAttachments++;
                    await downloadAttachments(fullEmail, message.id);
                }
            } catch (error) {
                console.error(`Error processing email: ${error.message}`);
            }
        }

        console.log('\nProceso completado.');
        console.log(`Total emails procesados: ${processedEmails}`);
        console.log(`Emails con archivos JSON: ${emailsWithJsonAttachments}`);
        console.log(`Los archivos adjuntos se han guardado en la carpeta "${path.relative(__dirname, config.attachmentsDir)}"`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
