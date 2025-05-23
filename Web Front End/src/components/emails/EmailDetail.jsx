import { useState } from 'react';
import { 
  Paper, 
  Typography, 
  Box, 
  Divider, 
  Chip, 
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { 
  Email as EmailIcon, 
  Reply as ReplyIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

export default function EmailDetail({ email }) {
  const [open, setOpen] = useState(false);

  if (!email) return null;

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch (error) {
      console.error('Date formatting error:', error);
      return dateString;
    }
  };

  // Extract email parts
  const subject = email.subject || 'No Subject';
  const from = email.sender || email.from || 'Unknown Sender';
  const date = formatDate(email.received || email.date || email.timestamp);
  const to = email.recipient || email.to || 'me';
  const body = email.body || email.content || email.message || 'No content';

  return (
    <>
      <Button 
        variant="outlined" 
        size="small" 
        startIcon={<InfoIcon />} 
        onClick={handleOpen}
        sx={{ ml: 1 }}
      >
        View
      </Button>

      <Dialog 
        open={open} 
        onClose={handleClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">{subject}</Typography>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>From:</strong> {from}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>To:</strong> {to}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Date:</strong> {date}
            </Typography>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {body}
          </Typography>
          
          {email.attachments && email.attachments.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Attachments
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {email.attachments.map((attachment, index) => (
                  <Chip 
                    key={index} 
                    label={attachment.name || `Attachment ${index + 1}`} 
                    variant="outlined" 
                  />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Close
          </Button>
          <Button 
            startIcon={<ReplyIcon />} 
            variant="contained" 
            color="primary"
          >
            Reply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 