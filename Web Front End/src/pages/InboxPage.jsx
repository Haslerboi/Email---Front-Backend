import { Typography, Box, Alert, CircularProgress, Button, IconButton } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import EmailList from '../components/emails/EmailList';
import { useEmails } from '../contexts/EmailContext';
import { useState } from 'react';

export default function InboxPage() {
  const { loading, error, refreshData } = useEmails();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshData();
    } catch (err) {
      console.error('Error refreshing emails:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Inbox
        </Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading || refreshing}
          color="primary"
          title="Refresh emails"
        >
          <RefreshIcon />
        </IconButton>
      </Box>
      
      <Typography variant="body1" paragraph>
        View and manage your incoming emails.
      </Typography>
      
      {(loading || refreshing) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {error && !refreshing && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {!loading && !refreshing && !error && <EmailList />}
    </Box>
  );
} 