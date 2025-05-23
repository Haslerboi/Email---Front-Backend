import { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Chip, 
  IconButton, 
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { 
  CheckCircle as CheckIcon, 
  Cancel as CancelIcon, 
  Refresh as RefreshIcon,
  Info as InfoIcon 
} from '@mui/icons-material';
import { getApiStatus } from '../../services/apiStatus';

export default function ApiStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const checkStatus = async () => {
    setLoading(true);
    try {
      const result = await getApiStatus();
      setStatus(result);
    } catch (error) {
      console.error('Error checking API status:', error);
      setStatus({
        status: 'error',
        message: 'Error checking API status',
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    checkStatus();
  }, []);
  
  const handleRefresh = () => {
    checkStatus();
  };
  
  const handleOpenDialog = () => {
    setDialogOpen(true);
  };
  
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };
  
  const getStatusChip = () => {
    if (loading) {
      return (
        <Chip 
          label="Checking..." 
          size="small" 
          color="default"
        />
      );
    }
    
    switch (status?.status) {
      case 'connected':
        return (
          <Chip 
            icon={<CheckIcon />} 
            label="Connected" 
            size="small" 
            color="success"
          />
        );
      case 'disconnected':
        return (
          <Chip 
            icon={<CancelIcon />} 
            label="Using Mock Data" 
            size="small" 
            color="warning"
          />
        );
      case 'error':
        return (
          <Chip 
            icon={<CancelIcon />} 
            label="Connection Error" 
            size="small" 
            color="error"
          />
        );
      default:
        return (
          <Chip 
            label="Unknown" 
            size="small" 
            color="default"
          />
        );
    }
  };
  
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {getStatusChip()}
        
        <Tooltip title="View API status details">
          <IconButton size="small" onClick={handleOpenDialog}>
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Refresh API status">
          <IconButton size="small" onClick={handleRefresh} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>API Connection Status</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            {status?.message || 'Checking API status...'}
          </Typography>
          
          {status?.details && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Endpoint Details:
              </Typography>
              
              <List dense>
                {Object.entries(status.details).map(([name, info], index) => (
                  <div key={name}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemText
                        primary={`${name.charAt(0).toUpperCase() + name.slice(1)} API`}
                        secondary={
                          info.available 
                            ? `Available at ${info.url}` 
                            : 'Not available - using mock data'
                        }
                      />
                      {info.available ? (
                        <CheckIcon color="success" />
                      ) : (
                        <CancelIcon color="warning" />
                      )}
                    </ListItem>
                  </div>
                ))}
              </List>
            </>
          )}
          
          {status?.error && (
            <Typography color="error" sx={{ mt: 2 }}>
              Error: {status.error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRefresh} startIcon={<RefreshIcon />}>
            Refresh
          </Button>
          <Button onClick={handleCloseDialog}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 