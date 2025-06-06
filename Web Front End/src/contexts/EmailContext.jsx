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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAllData = async () => {
    console.log('EmailContext: fetchAllData called. NOTE: Most fetches are currently disabled for simplified UI.');
    setLoading(true);
    setError(null);
    
    try {
      // // Fetch emails (Currently disabled for simplified UI)
      // console.log('EmailContext: Fetching emails from API...');
      // const emailsResponse = await emailApi.getEmails();
      // console.log('EmailContext: Emails received:', emailsResponse);
      // // ... (processing logic for emailsResponse)
      // setEmails(emailData);
      
      // // Fetch drafts (Currently disabled)
      // console.log('EmailContext: Fetching drafts from API...');
      // const draftsResponse = await emailApi.getDrafts();
      // // ... (processing logic for draftsResponse)
      // setDrafts(draftData);
      
      // // Fetch questions (Currently disabled)
      // console.log('EmailContext: Fetching questions from API...');
      // const questionsResponse = await emailApi.getQuestions();
      // // ... (processing logic for questionsResponse)
      // setPendingQuestions(questionData);
      
      // // Fetch history (Currently disabled)
      // console.log('EmailContext: Fetching history from API...');
      // const historyResponse = await emailApi.getHistory();
      // // ... (processing logic for historyResponse)
      // setHistory(historyData);
      
      // Simulate completion for now as no actual calls are made that would set loading to false otherwise
      console.log('EmailContext: Mock data loading complete (fetches disabled).');
      
    } catch (err) {
      console.error('EmailContext: Error in (disabled) fetchAllData:', err);
      setError('An error occurred (fetches disabled).');
    } finally {
      setLoading(false);
      console.log('EmailContext: Finished (disabled) fetchAllData');
    }
  };

  useEffect(() => {
    // fetchAllData(); // Temporarily disable fetchAllData on mount
    console.log('EmailContext: Initial fetchAllData on mount is currently disabled.');
    setLoading(false); // Ensure loading is false if not fetching
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