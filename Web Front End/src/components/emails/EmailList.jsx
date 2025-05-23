import { 
  List, 
  ListItem, 
  ListItemText, 
  ListItemSecondaryAction, 
  IconButton, 
  Typography, 
  Paper,
  Divider,
  CircularProgress,
  Alert,
  Box,
  Button,
  Chip
} from '@mui/material';
import { 
  MailOutline as MailIcon, 
  Delete as DeleteIcon, 
  ArrowForward as ArrowForwardIcon,
  Warning as WarningIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { useEmails } from '../../contexts/EmailContext';
import { formatDistanceToNow } from 'date-fns';
import EmailDetail from './EmailDetail';

export default function EmailList() {
  const { emails, loading, error } = useEmails();

  // Show loading state
  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 5, textAlign: 'center' }}>
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body1">Loading emails...</Typography>
      </Paper>
    );
  }

  // Show error state
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  // Show empty state
  if (!emails || emails.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1">No emails to display</Typography>
      </Paper>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid date';
    }
  };

  // Debug information
  console.log('Rendering emails:', emails);

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2" color="text.secondary">
          Displaying {emails.length} email(s)
        </Typography>
        
        {(error || window.location.hostname === 'localhost') && (
          <Chip 
            icon={<StorageIcon />} 
            label="Using Mock Data" 
            color="warning" 
            size="small" 
          />
        )}
      </Box>
      
      <Paper elevation={2}>
        <List>
          {emails.map((email, index) => {
            const emailSubject = email.subject || 'No Subject';
            const emailSender = email.sender || email.from || 'Unknown Sender';
            const emailDate = email.received || email.date || email.timestamp;
            
            return (
              <div key={email.id || index}>
                {index > 0 && <Divider />}
                <ListItem alignItems="flex-start">
                  <MailIcon sx={{ mr: 2, mt: 1 }} />
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" fontWeight="bold">
                        {emailSubject}
                      </Typography>
                    }
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.primary">
                          From: {emailSender}
                        </Typography>
                        <br />
                        <Typography component="span" variant="body2">
                          Received: {formatDate(emailDate)}
                        </Typography>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <EmailDetail email={email} />
                  </ListItemSecondaryAction>
                </ListItem>
              </div>
            );
          })}
        </List>
      </Paper>
    </>
  );
} 