import { createContext, useState, useContext, useEffect } from 'react';
import { emailApi } from '../services/api';

const EmailContext = createContext();

export function useEmails() {
  return useContext(EmailContext);
}

export function EmailProvider({ children }) {
  const [emails, setEmails] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Function to fetch all data from API
  const fetchAllData = async () => {
    console.log('EmailContext: Starting to fetch data...');
    setLoading(true);
    setError(null);
    
    try {
      // Fetch emails
      console.log('EmailContext: Fetching emails from API...');
      const emailsResponse = await emailApi.getEmails();
      console.log('EmailContext: Emails received:', emailsResponse);
      
      // Process emails
      let emailData = [];
      if (emailsResponse.data) {
        if (Array.isArray(emailsResponse.data)) {
          emailData = emailsResponse.data;
        } else if (emailsResponse.data.emails) {
          emailData = emailsResponse.data.emails;
        } else if (emailsResponse.data.data) {
          emailData = emailsResponse.data.data;
        } else if (typeof emailsResponse.data === 'object') {
          emailData = [emailsResponse.data];
        }
      }
      setEmails(emailData);
      
      // Fetch drafts
      console.log('EmailContext: Fetching drafts from API...');
      const draftsResponse = await emailApi.getDrafts();
      console.log('EmailContext: Drafts received:', draftsResponse);
      
      // Process drafts
      let draftData = [];
      if (draftsResponse.data) {
        if (Array.isArray(draftsResponse.data)) {
          draftData = draftsResponse.data;
        } else if (draftsResponse.data.drafts) {
          draftData = draftsResponse.data.drafts;
        } else if (draftsResponse.data.data) {
          draftData = draftsResponse.data.data;
        }
      }
      setDrafts(draftData);
      
      // Fetch questions
      console.log('EmailContext: Fetching questions from API...');
      const questionsResponse = await emailApi.getQuestions();
      console.log('EmailContext: Questions received:', questionsResponse);
      
      // Process questions
      let questionData = [];
      if (questionsResponse.data) {
        if (Array.isArray(questionsResponse.data)) {
          questionData = questionsResponse.data;
        } else if (questionsResponse.data.questions) {
          questionData = questionsResponse.data.questions;
        } else if (questionsResponse.data.data) {
          questionData = questionsResponse.data.data;
        }
      }
      setPendingQuestions(questionData);
      
      // Fetch history
      console.log('EmailContext: Fetching history from API...');
      const historyResponse = await emailApi.getHistory();
      console.log('EmailContext: History received:', historyResponse);
      
      // Process history
      let historyData = [];
      if (historyResponse.data) {
        if (Array.isArray(historyResponse.data)) {
          historyData = historyResponse.data;
        } else if (historyResponse.data.history) {
          historyData = historyResponse.data.history;
        } else if (historyResponse.data.data) {
          historyData = historyResponse.data.data;
        }
      }
      setHistory(historyData);
      
    } catch (err) {
      console.error('EmailContext: Error fetching data:', err);
      setError('Failed to load data from the server. Please try again later.');
    } finally {
      setLoading(false);
      console.log('EmailContext: Finished loading data');
    }
  };

  // Load all data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  // Function to answer a pending question
  const answerQuestion = async (questionId, answer) => {
    try {
      console.log(`EmailContext: Answering question ${questionId} with:`, answer);
      
      // Call the backend API to submit the answer
      const response = await emailApi.answerQuestion(questionId, answer);
      console.log('EmailContext: Answer submission response:', response);
      
      // Remove the question from the pending list
      setPendingQuestions(prevQuestions => 
        prevQuestions.filter(q => q.id !== questionId)
      );
      
      // Check if we got a draft back from the API
      let newDraft = null;
      if (response.data && response.data.draft) {
        newDraft = response.data.draft;
        console.log('EmailContext: New draft created:', newDraft);
        
        // Add the new draft to the drafts list
        setDrafts(prev => [...prev, newDraft]);
      }
      
      // Refresh the data to get the latest state
      fetchAllData();
      
      return { 
        success: true, 
        message: 'Answer submitted successfully', 
        draft: newDraft 
      };
    } catch (err) {
      console.error('EmailContext: Error submitting answer:', err);
      return { 
        success: false, 
        error: err.response?.data?.message || err.message || 'Failed to submit answer'
      };
    }
  };

  // Function to approve a draft
  const approveDraft = async (draftId, editedContent) => {
    try {
      console.log(`EmailContext: Approving draft ${draftId} with content:`, editedContent);
      
      // Call the backend API to send the email
      const response = await emailApi.approveDraft(draftId, editedContent);
      console.log('EmailContext: Draft approval response:', response);
      
      // Update the drafts list
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      
      // Refresh data to get the latest state
      fetchAllData();
      
      return { success: true, data: response.data };
    } catch (err) {
      console.error('EmailContext: Error approving draft:', err);
      return { 
        success: false, 
        error: err.response?.data?.message || err.message || 'Failed to send email'
      };
    }
  };

  const value = {
    emails,
    setEmails,
    drafts,
    pendingQuestions,
    setPendingQuestions,
    history,
    loading,
    error,
    answerQuestion,
    approveDraft,
    refreshData: fetchAllData
  };

  return (
    <EmailContext.Provider value={value}>
      {children}
    </EmailContext.Provider>
  );
} 