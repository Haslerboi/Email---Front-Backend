import { useState } from 'react';
import { 
  Typography, 
  Box, 
  Button, 
  Paper, 
  CircularProgress, 
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import { emailApi } from '../services/api';

export default function DebugPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [emails, setEmails] = useState([]);
  const [responseData, setResponseData] = useState(null);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await emailApi.getEmails();
      console.log('API Response:', response);
      
      setEmails(response.data || []);
      setResponseData({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: {
          url: response.config.url,
          method: response.config.method,
          baseURL: response.config.baseURL
        }
      });
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError(`Failed to load emails: ${err.message}`);
      if (err.response) {
        setResponseData({
          status: err.response.status,
          statusText: err.response.statusText,
          data: err.response.data
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        API Debug Page
      </Typography>
      
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Test API Endpoints
        </Typography>
        
        <Button 
          variant="contained" 
          onClick={fetchEmails} 
          disabled={loading}
          sx={{ mr: 2 }}
        >
          Fetch Emails
        </Button>
        
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
            <CircularProgress size={24} sx={{ mr: 2 }} />
            <Typography>Loading...</Typography>
          </Box>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>
      
      {responseData && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            API Response Details
          </Typography>
          
          <Typography variant="body1">
            Status: {responseData.status} {responseData.statusText}
          </Typography>
          
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Request:
            </Typography>
            <Typography variant="body2">
              URL: {responseData.config?.baseURL}{responseData.config?.url}<br />
              Method: {responseData.config?.method?.toUpperCase()}
            </Typography>
          </Box>
        </Paper>
      )}
      
      {emails.length > 0 && (
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Emails Retrieved: {emails.length}
          </Typography>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {emails.map((email, index) => (
                  <TableRow key={email.id || index}>
                    <TableCell>{email.id || index}</TableCell>
                    <TableCell>{email.subject}</TableCell>
                    <TableCell>{email.sender || email.from}</TableCell>
                    <TableCell>{new Date(email.received || email.date || email.timestamp).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
} 