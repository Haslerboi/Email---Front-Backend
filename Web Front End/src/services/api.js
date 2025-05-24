import axios from 'axios';
import axiosLogger from 'axios-logger';

// Determine API base URL based on environment
let apiBaseURL;

// const railwayAppUrl = 'https://your-actual-railway-app-name.up.railway.app/api'; // Replace with your app's URL
const railwayAppUrl = 'https://assistant-backend-production-fc69.up.railway.app/api'; // Using the known URL

if (import.meta.env.DEV) {
  // To make local development (npm run dev) point to Railway:
  apiBaseURL = railwayAppUrl;
  console.warn(`DEV mode is pointing to LIVE Railway backend: ${apiBaseURL}`);
  
  // To make local development point to local backend (original setup):
  // apiBaseURL = 'http://localhost:3000/api'; 
} else if (import.meta.env.PROD) { 
  apiBaseURL = railwayAppUrl;
} else {
  // Fallback for unknown environments, could also point to Railway or local
  apiBaseURL = railwayAppUrl; 
  console.warn(`Unknown environment, defaulting API base URL to LIVE Railway backend: ${apiBaseURL}`);
}

// Create an axios instance with default config
const api = axios.create({
  baseURL: apiBaseURL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: false
});

// Add logger for debugging - using the correct configuration
if (axiosLogger && typeof axiosLogger === 'function') {
  // Use the default export if it's a function
  api.interceptors.request.use(axiosLogger);
  api.interceptors.response.use(axiosLogger);
} else {
  // Use named exports if available
  console.log('Using custom logger configuration');
}

// Add request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // For now, don't require real authentication
    // Just log the request for debugging
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.statusText}`, {
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('API Response Error:', {
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : 'No response'
    });
    return Promise.reject(error);
  }
);

// Use mock data as fallback when API endpoints aren't available
const useMockData = false;

// New Mock Data for Emails Needing Input
const mockEmailsNeedingInput = [
  {
    id: 'emailInput1',
    originalEmail: {
      id: 'origEmail123',
      subject: 'Urgent: Query about Project Alpha deliverables',
      sender: 'client@example.com',
      body: 'Hello Team,\n\nI need an update on the deliverables for Project Alpha. Specifically, what is the status of Task A, and when can we expect the report for Task B? Also, is the issue with Component C resolved?\n\nThanks,\nClient',
    },
    draftWithQuestionsTemplate: "Dear Client,\n\nThank you for your email regarding Project Alpha.\n\nRegarding Task A, the status is: {{answer_q1}}.\nWe expect to deliver the report for Task B by {{answer_q2}}.\nConcerning Component C, the current situation is {{answer_q3}}.\n\nBest regards,\nAssistant",
    questions: [
      { id: 'q1', text: 'What is the status of Task A?', answer: '' },
      { id: 'q2', text: 'When can we expect the report for Task B?', answer: '' },
      { id: 'q3', text: 'Is the issue with Component C resolved? If so, how? If not, what is the plan?', answer: '' },
    ],
  },
  {
    id: 'emailInput2',
    originalEmail: {
      id: 'origEmail456',
      subject: 'Follow-up: Meeting Minutes & Action Items',
      sender: 'colleague@example.com',
      body: 'Hi there,\n\nCould you please confirm if the action item assigned to you from last week\'s meeting (regarding the Q3 budget proposal) has been completed? If not, what\'s the ETA?\n\nBest,\nColleague',
    },
    draftWithQuestionsTemplate: 'Hi Colleague,\n\nRegarding the Q3 budget proposal action item: {{answer_q4}}.\nMy estimated time for completion is {{answer_q5}}.\n\nThanks,\nAssistant',
    questions: [
      { id: 'q4', text: 'Has the Q3 budget proposal action item been completed? (Yes/No/Partially)', answer: '' },
      { id: 'q5', text: 'If not fully completed, what is the current ETA for the Q3 budget proposal?', answer: '' },
    ],
  }
];

// Email related API calls
export const emailApi = {
  // Get all emails
  getEmails: async () => {
    try {
      // Try different endpoint paths to find the right one
      let endpoints = ['/emails']; // Standardize to expect routes under /api via baseURL
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.get(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock email data');
        return {
          status: 200,
          data: mockEmails
        };
      }
      throw error;
    }
  },
  
  // Get email drafts
  getDrafts: async () => {
    try {
      // Try different endpoint paths
      let endpoints = ['/drafts']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.get(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock draft data');
        return {
          status: 200,
          data: mockDrafts
        };
      }
      throw error;
    }
  },
  
  // Get pending questions
  getQuestions: async () => {
    try {
      // Try different endpoint paths
      let endpoints = ['/questions']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.get(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock question data');
        return {
          status: 200,
          data: mockQuestions
        };
      }
      throw error;
    }
  },
  
  // Get email history
  getHistory: async () => {
    try {
      // Try different endpoint paths
      let endpoints = ['/history']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.get(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock history data');
        return {
          status: 200,
          data: mockHistory
        };
      }
      throw error;
    }
  },
  
  // Answer a question
  answerQuestion: async (questionId, answer) => {
    try {
      // Try different endpoint paths
      let endpoints = [
        `/questions/${questionId}/answer` // Standardize
      ];
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.post(endpoint, { answer });
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock answer response');
        return {
          status: 200,
          data: {
            message: 'Answer processed successfully (mock)',
            draft: {
              id: Date.now(),
              inReplyTo: questionId,
              content: `Thank you for your response. Based on your answer: "${answer}", I've prepared this draft reply. Please review and approve.`,
              createdAt: new Date().toISOString(),
              status: 'pending_review'
            }
          }
        };
      }
      throw error;
    }
  },
  
  // Approve and send a draft
  approveDraft: async (draftId, content) => {
    try {
      // Try different endpoint paths
      let endpoints = [
        `/drafts/${draftId}/approve` // Standardize
      ];
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.post(endpoint, { content });
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock approval response');
        return {
          status: 200,
          data: {
            message: 'Email sent successfully (mock)',
            draftId
          }
        };
      }
      throw error;
    }
  },

  getEmailsNeedingInput: async () => {
    console.log('API: getEmailsNeedingInput called - attempting to fetch from backend');
    try {
      // Ensure this path matches what's in backend routes/index.js (e.g., '/emails-needing-input')
      const response = await api.get('/emails-needing-input'); 
      console.log('API: getEmailsNeedingInput response from backend:', response.data);
      return response; // Return the full response object so .data can be accessed
    } catch (error) {
      console.error('API Error fetching emails needing input:', error);
      // Fallback to frontend mock data IF THE ERROR IS A NETWORK ERROR or 404 and we want to allow UI dev.
      // For now, let's re-throw so we see issues, unless it's a specific case.
      // To re-enable mock for UI dev if backend isn't ready for this endpoint:
      // if (some_condition_to_use_mock_eg_error_is_404) {
      //  console.warn('Returning frontend mock emails needing input data due to API error.');
      //  return { status: 200, data: mockEmailsNeedingInput }; // mockEmailsNeedingInput is defined above
      // }
      throw error; // Re-throw the error to be handled by the calling component
    }
  },

  submitAnswersForEmail: async (inputId, answers, completedDraft) => {
    console.log('API: submitAnswersForEmail called with:', { inputId, answers, completedDraft });
    try {
      // Ensure this path matches (e.g., '/process-answered-email/:inputId')
      const response = await api.post(`/process-answered-email/${inputId}`, { answers }); 
      console.log('API: submitAnswersForEmail response from backend:', response.data);
      return response;
    } catch (error) {
      console.error('API Error submitting answers:', error);
      throw error;
    }
  },

  deleteTask: async (taskId) => {
    console.log(`API: deleteTask called for task ID: ${taskId}`);
    try {
      // Note: The backend route is /api/tasks/:taskId
      // The baseURL in api.js is already /api, so just /tasks/:taskId
      const response = await api.delete(`/tasks/${taskId}`);
      console.log('API: deleteTask response from backend:', response.data);
      return response; // Contains { message: ... } on success
    } catch (error) {
      console.error(`API Error deleting task ${taskId}:`, error);
      throw error; // Re-throw to be handled by the calling component
    }
  }
};

// Authentication related API calls
export const authApi = {
  login: async (email, password) => {
    try {
      // Try different endpoint paths
      let endpoints = ['/auth/login']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.post(endpoint, { email, password });
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock login response');
        return {
          status: 200,
          data: {
            token: 'mock-jwt-token',
            user: { 
              id: 1, 
              name: 'Test User', 
              email 
            }
          }
        };
      }
      throw error;
    }
  },
    
  logout: async () => {
    try {
      // Try different endpoint paths
      let endpoints = ['/auth/logout']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.post(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock logout response');
        return { status: 200 };
      }
      throw error;
    }
  },
    
  getCurrentUser: async () => {
    try {
      // Try different endpoint paths
      let endpoints = ['/auth/user']; // Standardize
      let response = null;
      let error = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          response = await api.get(endpoint);
          if (response.status === 200) {
            console.log(`Successful endpoint found: ${endpoint}`);
            return response;
          }
        } catch (err) {
          error = err;
          console.log(`Endpoint ${endpoint} failed: ${err.message}`);
        }
      }
      
      throw error || new Error('All endpoints failed');
    } catch (error) {
      if (useMockData) {
        console.log('Using mock user data');
        return {
          status: 200,
          data: { 
            id: 1, 
            name: 'Test User', 
            email: 'user@example.com' 
          }
        };
      }
      throw error;
    }
  },
};

// Mock data for development and testing
const mockEmails = [
  { 
    id: 1, 
    subject: 'Meeting Request', 
    sender: 'john@example.com', 
    received: '2023-09-10T10:30:00Z',
    body: 'Hello,\n\nI would like to schedule a meeting with you to discuss the project.\n\nBest regards,\nJohn'
  },
  { 
    id: 2, 
    subject: 'Project Update', 
    sender: 'sarah@example.com', 
    received: '2023-09-09T14:15:00Z',
    body: 'Hi,\n\nHere is the latest update on the project. We are making good progress.\n\nRegards,\nSarah'
  }
];

const mockDrafts = [
  { 
    id: 101, 
    inReplyTo: 1, 
    content: 'Thank you for your meeting request. I am available on Friday at 2pm.', 
    createdAt: '2023-09-10T11:00:00Z',
    status: 'pending_review'
  }
];

const mockQuestions = [
  {
    id: 201,
    emailId: 2,
    question: 'What is the deadline for the project delivery?',
    createdAt: '2023-09-09T14:30:00Z'
  }
];

const mockHistory = [
  {
    id: 301,
    originalEmailId: 3,
    subject: 'Invoice Payment',
    handled: '2023-09-05T09:45:00Z',
    status: 'completed'
  }
];

export default api; 