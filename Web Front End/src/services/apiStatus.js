import api from './api';

/**
 * Checks if the API is available by sending a test request
 * @returns {Promise<{ available: boolean, endpoints: Object }>}
 */
export const checkApiStatus = async () => {
  let isBackendAvailable = false;
  let backendUrl = null;

  try {
    // Only check a single, reliable backend endpoint like /status or the root
    // The baseURL in api.js is /api, so '/status' becomes /api/status
    const response = await api.get('/status', { timeout: 20000 }); 
    if (response.status === 200) {
      isBackendAvailable = true;
      backendUrl = '/api/status'; // Reflecting the full path hit
      console.log('ApiStatus: Backend /api/status is available.');
    } else {
      console.log('ApiStatus: Backend /api/status returned status:', response.status);
    }
  } catch (error) {
    console.warn('ApiStatus: Error checking backend /api/status:', error.message);
  }

  // For the details in the dialog, we can report on the new primary endpoint
  // This part doesn't make a real call, just describes what we expect to be available.
  const endpointDetails = {
    emailsNeedingInput: {
      available: isBackendAvailable, // Assume if /status is up, this *should* be too
      url: '/api/emails-needing-input'
    },
    processAnsweredEmail: {
        available: isBackendAvailable,
        url: '/api/process-answered-email/:id'
    }
    // Add other key endpoints here if needed later, but keep checks minimal
  };

  return {
    available: isBackendAvailable,
    endpoints: endpointDetails // Simplified details
  };
};

/**
 * Get the API connection status
 * @returns {Promise<string>} Status message
 */
export const getApiStatus = async () => {
  try {
    const statusCheckResult = await checkApiStatus(); // Renamed for clarity
    
    if (statusCheckResult.available) {
      return {
        status: 'connected',
        // The message can be more generic now, or reflect the baseURL from api.js
        message: `Connected to backend. (${api.defaults.baseURL})`,
        details: statusCheckResult.endpoints
      };
    } else {
      return {
        status: 'disconnected',
        message: `Could not connect to backend. (${api.defaults.baseURL}) Some features may use mock data or fail.`,
        details: statusCheckResult.endpoints
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Error checking API connection',
      error: error.message
    };
  }
};

export default { checkApiStatus, getApiStatus }; 