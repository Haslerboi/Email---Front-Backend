import { 
  List, 
  ListItem, 
  ListItemText, 
  ListItemSecondaryAction, 
  IconButton, 
  Typography, 
  Paper,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Send as SendIcon,
  Cancel as CancelIcon,
  CheckCircle as SuccessIcon
} from '@mui/icons-material';
import { useEmails } from '../../contexts/EmailContext';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

export default function DraftList() {
  const { drafts, approveDraft } = useEmails();
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [editedContent, setEditedContent] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  if (drafts.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1">No drafts to display</Typography>
      </Paper>
    );
  }

  const formatDate = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const handleEditClick = (draft) => {
    setSelectedDraft(draft);
    setEditedContent(draft.content);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedDraft(null);
  };

  const handleApprove = async () => {
    if (selectedDraft) {
      setSending(true);
      
      try {
        const result = await approveDraft(selectedDraft.id, editedContent);
        
        if (result.success) {
          setNotification({
            open: true,
            message: 'Email sent successfully!',
            severity: 'success'
          });
          handleDialogClose();
        } else {
          setNotification({
            open: true,
            message: result.error || 'Failed to send email',
            severity: 'error'
          });
        }
      } catch (error) {
        setNotification({
          open: true,
          message: error.message || 'An unexpected error occurred',
          severity: 'error'
        });
      } finally {
        setSending(false);
      }
    }
  };

  const handleCloseNotification = () => {
    setNotification({
      ...notification,
      open: false
    });
  };

  return (
    <>
      <Paper elevation={2}>
        <List>
          {drafts.map((draft, index) => (
            <div key={draft.id}>
              {index > 0 && <Divider />}
              <ListItem alignItems="flex-start">
                <ListItemText
                  primary={
                    <Typography variant="subtitle1" fontWeight="bold">
                      Draft Reply (Email #{draft.inReplyTo})
                    </Typography>
                  }
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        Created: {formatDate(draft.createdAt)}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {draft.content.length > 100
                          ? `${draft.content.substring(0, 100)}...`
                          : draft.content}
                      </Typography>
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" aria-label="edit" onClick={() => handleEditClick(draft)}>
                    <EditIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            </div>
          ))}
        </List>
      </Paper>

      <Dialog open={dialogOpen} onClose={handleDialogClose} fullWidth maxWidth="md">
        <DialogTitle>Edit Draft Reply</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={10}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            variant="outlined"
            margin="normal"
            disabled={sending}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleDialogClose} 
            startIcon={<CancelIcon />} 
            color="error"
            disabled={sending}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleApprove} 
            startIcon={sending ? <CircularProgress size={20} /> : <SendIcon />} 
            color="primary" 
            variant="contained"
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Approve & Send'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={notification.open} 
        autoHideDuration={6000} 
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
} 