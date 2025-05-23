import api from './api';

/**
 * Checks if the API is available by sending a test request
 * @returns {Promise<{ available: boolean, endpoints: Object }>}
 */
export const checkApiStatus = async () => {
  const endpointTests = {
    emails: { available: false, url: null },
    drafts: { available: false, url: null },
    questions: { available: false, url: null },
    history: { available: false, url: null },
    auth: { available: false, url: null },
  };
  
  // Array of test endpoints to try
  const testEndpoints = {
    emails: ['/emails', '/api/emails', '/email', '/api/email'],
    drafts: ['/drafts', '/api/drafts', '/draft', '/api/draft'],
    questions: ['/questions', '/api/questions', '/question', '/api/question'],
    history: ['/history', '/api/history', '/histories', '/api/histories'],
    auth: ['/auth/user', '/api/auth/user', '/user', '/api/user', '/me', '/api/me']
  };
  
  // Test each endpoint category
  for (const [category, endpoints] of Object.entries(testEndpoints)) {
    for (const endpoint of endpoints) {
      try {
        const response = await api.get(endpoint, { timeout: 5000 });
        if (response.status === 200) {
          endpointTests[category].available = true;
          endpointTests[category].url = endpoint;
          break;
        }
      } catch (error) {
        // Continue to the next endpoint
        console.log(`Endpoint ${endpoint} not available`);
      }
    }
  }
  
  // If any endpoint is available, the API is considered available
  const isApiAvailable = Object.values(endpointTests).some(test => test.available);
  
  return {
    available: isApiAvailable,
    endpoints: endpointTests
  };
};

/**
 * Get the API connection status
 * @returns {Promise<string>} Status message
 */
export const getApiStatus = async () => {
  try {
    const status = await checkApiStatus();
    
    if (status.available) {
      return {
        status: 'connected',
        message: 'Connected to Railway backend',
        details: status.endpoints
      };
    } else {
      return {
        status: 'disconnected',
        message: 'Could not connect to Railway backend. Using mock data.',
        details: status.endpoints
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