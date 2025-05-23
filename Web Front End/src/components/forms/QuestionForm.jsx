import { 
  Card, 
  CardContent, 
  CardActions, 
  Typography, 
  TextField, 
  Button,
  Box,
  Divider,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { 
  Send as SendIcon,
  Edit as EditIcon,
  CheckCircle as SuccessIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useEmails } from '../../contexts/EmailContext';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function QuestionForm({ question }) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [draftPreview, setDraftPreview] = useState({
    open: false,
    draft: null
  });
  
  const { answerQuestion } = useEmails();
  const navigate = useNavigate();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!answer.trim()) return;
    
    setSubmitting(true);
    
    try {
      const result = await answerQuestion(question.id, answer);
      
      if (result.success) {
        setNotification({
          open: true,
          message: 'Answer submitted successfully!',
          severity: 'success'
        });
        
        // If we got a draft back, show it in the preview
        if (result.draft) {
          setDraftPreview({
            open: true,
            draft: result.draft
          });
        }
        
        // Clear the answer
        setAnswer('');
      } else {
        setNotification({
          open: true,
          message: result.error || 'Failed to submit answer',
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
      setSubmitting(false);
    }
  };
  
  const handleCloseNotification = () => {
    setNotification({
      ...notification,
      open: false
    });
  };
  
  const handleCloseDraftPreview = () => {
    setDraftPreview({
      ...draftPreview,
      open: false
    });
  };
  
  const handleViewDrafts = () => {
    navigate('/drafts');
    handleCloseDraftPreview();
  };
  
  const formatDate = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };
  
  return (
    <>
      <Card elevation={3} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Question from Email #{question.emailId}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Asked {formatDate(question.createdAt)}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body1" sx={{ my: 2, fontWeight: 'medium' }}>
            {question.question}
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Your Answer"
              variant="outlined"
              fullWidth
              multiline
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              sx={{ mt: 2 }}
              required
              disabled={submitting}
            />
          </Box>
        </CardContent>
        <CardActions sx={{ justifyContent: 'flex-end', p: 2 }}>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={submitting ? <CircularProgress size={20} /> : <SendIcon />}
            onClick={handleSubmit}
            disabled={!answer.trim() || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Answer'}
          </Button>
        </CardActions>
      </Card>
      
      {/* Notification for success/error */}
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
      
      {/* Draft Preview Dialog */}
      <Dialog 
        open={draftPreview.open} 
        onClose={handleCloseDraftPreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SuccessIcon color="success" sx={{ mr: 1 }} />
            <Typography variant="h6">Draft Created</Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Based on your answer, the following draft reply has been created:
          </Typography>
          
          <Box sx={{ 
            mt: 2, 
            p: 2, 
            bgcolor: 'background.paper', 
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider'
          }}>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {draftPreview.draft?.content || ''}
            </Typography>
          </Box>
          
          <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
            You can edit this draft before sending it from the Drafts page.
          </Typography>
        </DialogContent>
        
        <DialogActions>
          <Button 
            onClick={handleCloseDraftPreview} 
            startIcon={<CloseIcon />}
          >
            Close
          </Button>
          <Button 
            onClick={handleViewDrafts} 
            startIcon={<EditIcon />}
            variant="contained"
            color="primary"
          >
            View in Drafts
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 