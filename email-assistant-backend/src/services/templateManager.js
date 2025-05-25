import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatesDir = path.join(__dirname, '../templates');

const templateFileMap = {
  'Wedding Enquiry': 'wedding_enquiry_guide.md',
  'Main Website Enquiry': 'main_website_enquiry_guide.md',
  'Other': 'other_enquiry_guide.md',
  'default': 'default_guide.md' // Fallback
};

async function loadTemplate(templateName) {
  const fileName = templateFileMap[templateName] || templateFileMap['default'];
  const filePath = path.join(templatesDir, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    logger.info(`Template "${templateName}" (file: ${fileName}) loaded successfully.`, {tag: 'templateManager'});
    return content;
  } catch (error) {
    logger.error(`Error loading template "${templateName}" (file: ${fileName}): ${error.message}`, {tag: 'templateManager'});
    // Fallback to default template if specific one fails, unless it was the default failing
    if (templateName !== 'default') {
      logger.warn(`Falling back to default template.`, {tag: 'templateManager'});
      return loadTemplate('default');
    }
    // If default also fails, return a very basic fallback or throw
    return "Please provide a helpful and professional reply to the user's email."; 
  }
}

export const getGuidanceForCategory = async (category) => {
  if (!category || !templateFileMap[category]) {
    logger.warn(`No specific template for category "${category}", using default.`, {tag: 'templateManager'});
    return await loadTemplate('default');
  }
  return await loadTemplate(category);
};

export default { getGuidanceForCategory }; 