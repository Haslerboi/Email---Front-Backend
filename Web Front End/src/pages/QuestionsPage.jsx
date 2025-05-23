import { Typography, Box, Alert, CircularProgress, IconButton } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import QuestionForm from '../components/forms/QuestionForm';
import { useEmails } from '../contexts/EmailContext';
import { useState } from 'react';

export default function QuestionsPage() {
  const { pendingQuestions, loading, error, refreshData } = useEmails();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshData();
    } catch (err) {
      console.error('QuestionsPage: Error refreshing questions:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Pending Questions
        </Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading || refreshing}
          color="primary"
          title="Refresh questions"
        >
          <RefreshIcon />
        </IconButton>
      </Box>
      
      <Typography variant="body1" paragraph>
        Provide answers to questions needed by the assistant to complete email drafts.
      </Typography>
      
      {(loading || refreshing) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {error && !refreshing && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {!loading && !refreshing && pendingQuestions.length === 0 && (
        <Alert severity="info">
          No pending questions at this time.
        </Alert>
      )}
      
      {!loading && !refreshing && pendingQuestions.length > 0 && (
        pendingQuestions.map(question => (
          <QuestionForm key={question.id} question={question} />
        ))
      )}
    </Box>
  );
} 