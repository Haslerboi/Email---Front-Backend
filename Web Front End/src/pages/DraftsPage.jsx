import { Typography, Box, Alert, CircularProgress, IconButton } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import DraftList from '../components/emails/DraftList';
import { useEmails } from '../contexts/EmailContext';
import { useState } from 'react';

export default function DraftsPage() {
  const { loading, error, refreshData } = useEmails();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshData();
    } catch (err) {
      console.error('Error refreshing drafts:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Email Drafts
        </Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading || refreshing}
          color="primary"
          title="Refresh drafts"
        >
          <RefreshIcon />
        </IconButton>
      </Box>
      
      <Typography variant="body1" paragraph>
        Review and edit suggested email replies before sending.
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
      
      {!loading && !refreshing && !error && <DraftList />}
    </Box>
  );
} 