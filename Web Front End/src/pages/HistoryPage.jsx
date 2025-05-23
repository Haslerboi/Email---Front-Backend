import { Typography, Box, Alert, CircularProgress, IconButton } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import HistoryList from '../components/emails/HistoryList';
import { useEmails } from '../contexts/EmailContext';
import { useState } from 'react';

export default function HistoryPage() {
  const { loading, error, refreshData } = useEmails();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshData();
    } catch (err) {
      console.error('Error refreshing history:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Email History
        </Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading || refreshing}
          color="primary"
          title="Refresh history"
        >
          <RefreshIcon />
        </IconButton>
      </Box>
      
      <Typography variant="body1" paragraph>
        View a record of all processed emails and their outcomes.
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
      
      {!loading && !refreshing && !error && <HistoryList />}
    </Box>
  );
} 