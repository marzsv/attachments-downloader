import fs from 'fs';
import path from 'path';

/**
 * Creates a subfolder in the attachments directory
 * @param {string} subfolderName - The name of the subfolder to create
 * @returns {string} - The path to the subfolder
 */
export function createSubfolder(subfolderName) {
    const subfolderPath = path.join(__dirname, 'attachments', subfolderName);

    if (!fs.existsSync(subfolderPath)) {
        fs.mkdirSync(subfolderPath);
    }
    return subfolderPath;
}

/**
 * Removes a subfolder in the attachments directory
 * @param {string} subfolderName - The name of the subfolder to remove
 */
export function removeSubfolder(subfolderName) {
    const subfolderPath = path.join(__dirname, 'attachments', subfolderName);

    if (fs.existsSync(subfolderPath)) {
        fs.rmdirSync(subfolderPath, { recursive: true });
    }
}
