import { 
  List, 
  ListItem, 
  ListItemText, 
  Typography, 
  Paper,
  Divider,
  Chip,
  Box
} from '@mui/material';
import {
  CheckCircleOutline as CheckIcon,
  HourglassEmpty as PendingIcon
} from '@mui/icons-material';
import { useEmails } from '../../contexts/EmailContext';
import { formatDistanceToNow } from 'date-fns';

export default function HistoryList() {
  const { history } = useEmails();

  if (history.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1">No history to display</Typography>
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

  const getStatusChip = (status) => {
    switch (status) {
      case 'completed':
        return <Chip icon={<CheckIcon />} label="Completed" color="success" size="small" />;
      case 'pending':
        return <Chip icon={<PendingIcon />} label="Pending" color="warning" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Paper elevation={2}>
      <List>
        {history.map((item, index) => (
          <div key={item.id}>
            {index > 0 && <Divider />}
            <ListItem alignItems="flex-start">
              <ListItemText
                primary={
                  <Typography variant="subtitle1" fontWeight="bold">
                    {item.subject}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary">
                      Handled: {formatDate(item.handled)}
                    </Typography>
                    <br />
                    <Typography component="span" variant="body2">
                      Original Email #{item.originalEmailId}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      {getStatusChip(item.status)}
                    </Box>
                  </>
                }
              />
            </ListItem>
          </div>
        ))}
      </List>
    </Paper>
  );
} 