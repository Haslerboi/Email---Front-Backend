/**
 * Task State Manager Service
 * 
 * Manages tasks (emails needing input) and persists them to a JSON file.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid'; // For generating unique task IDs
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '../../data');
const TASKS_STORAGE_FILE = path.join(STORAGE_DIR, 'tasks-needing-input.json');

let tasks = new Map(); // Stores taskId -> taskData

const ensureStorageDirectory = async () => {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Error creating storage directory: ${error.message}`, { tag: 'task-state', error: error.stack });
  }
};

const loadTasksFromFile = async () => {
  try {
    await ensureStorageDirectory();
    const data = await fs.readFile(TASKS_STORAGE_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    tasks = new Map(jsonData.map(item => [item.id, item])); // item itself is the task data
    logger.info(`Loaded ${tasks.size} tasks from storage`, { tag: 'task-state' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('No existing tasks file found, starting fresh', { tag: 'task-state' });
      tasks = new Map();
    } else {
      logger.error(`Error loading tasks: ${error.message}`, { tag: 'task-state', error: error.stack });
      tasks = new Map();
    }
  }
};

const saveTasksToFile = async () => {
  try {
    await ensureStorageDirectory();
    const serializedData = Array.from(tasks.values()); // Store array of task objects
    await fs.writeFile(TASKS_STORAGE_FILE, JSON.stringify(serializedData, null, 2), 'utf8');
    logger.info(`Saved ${tasks.size} tasks to file`, { tag: 'task-state' });
  } catch (error) {
    logger.error(`Error saving tasks: ${error.message}`, { tag: 'task-state', error: error.stack });
  }
};

loadTasksFromFile().catch(error => {
  logger.error(`Initial task loading failed: ${error.message}`, { tag: 'task-state' });
});

const TaskStateManager = {
  addTask: async (taskData) => {
    if (!taskData || !taskData.originalEmail) {
        logger.warn('Attempted to add invalid task data', { tag: 'task-state', taskData });
      return null;
    }
    // Prevent duplicate tasks for the same email unless the latest message has changed
    const duplicate = Array.from(tasks.values()).find(
      t =>
        t.originalEmail &&
        t.originalEmail.id === taskData.originalEmail.id &&
        (t.originalEmail.body === taskData.originalEmail.body || t.originalEmail.snippet === taskData.originalEmail.snippet)
    );
    if (duplicate) {
      logger.info('Duplicate task detected (same email and content), not adding again.', { tag: 'task-state', subject: taskData.originalEmail.subject });
      return duplicate;
    }
    const taskId = taskData.id || uuidv4();
    const taskToAdd = { ...taskData, id: taskId, createdAt: new Date().toISOString() };
    tasks.set(taskId, taskToAdd);
    logger.info(`Added new task: ${taskId}`, { tag: 'task-state', taskId, subject: taskData.originalEmail.subject });
    await saveTasksToFile();
    return taskToAdd;
  },

  getTask: (taskId) => {
    return tasks.get(taskId) || null;
  },

  listPendingTasks: () => {
    // Currently, all stored tasks are considered pending.
    // Add filtering logic here if tasks can have different statuses.
    return Array.from(tasks.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  removeTask: async (taskId) => {
    if (tasks.has(taskId)) {
      tasks.delete(taskId);
      logger.info(`Removed task: ${taskId}`, { tag: 'task-state', taskId });
      await saveTasksToFile();
      return true;
    }
    logger.warn(`Attempted to remove non-existent task: ${taskId}`, { tag: 'task-state' });
    return false;
  },
  
  updateTask: async (taskId, updatedProps) => {
    if (tasks.has(taskId)) {
      const task = tasks.get(taskId);
      const updatedTask = { ...task, ...updatedProps, updatedAt: new Date().toISOString() };
      tasks.set(taskId, updatedTask);
      logger.info(`Updated task: ${taskId}`, { tag: 'task-state', taskId });
      await saveTasksToFile();
      return updatedTask;
    }
    logger.warn(`Attempted to update non-existent task: ${taskId}`, { tag: 'task-state' });
    return null;
  }
};

export default TaskStateManager; 