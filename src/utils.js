import fs from 'fs';
import path from 'path';

export function createSubfolder(subfolderName) {
    const subfolderPath = path.join(__dirname, 'attachments', subfolderName);

    if (!fs.existsSync(subfolderPath)) {
        fs.mkdirSync(subfolderPath);
    }
    return subfolderPath;
}

export function removeSubfolder(subfolderName) {
    const subfolderPath = path.join(__dirname, 'attachments', subfolderName);

    if (fs.existsSync(subfolderPath)) {
        fs.rmdirSync(subfolderPath, { recursive: true });
    }
}
