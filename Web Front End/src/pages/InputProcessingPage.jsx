import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { emailApi } from '../services/api';
import {
  Container, Typography, Paper, TextField, Button, Box, CircularProgress, Alert,
  List, ListItem, ListItemButton, ListItemText, Divider, IconButton as MuiIconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';

function InputProcessingPage() {
  const { currentUser } = useAuth();
  const [inputTasks, setInputTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [answers, setAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setSubmissionStatus(null);
        const response = await emailApi.getEmailsNeedingInput();
        setInputTasks(response.data || []);
      } catch (err) {
        console.error('Failed to load input tasks:', err);
        setError('Failed to load tasks. Please try refreshing.');
        setInputTasks([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadTasks();
  }, []);

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    setSubmissionStatus(null);
    setError(null);
    const initialAnswers = {};
    if (task && task.questions) {
      task.questions.forEach(q => {
        initialAnswers[q.id] = q.answer || '';
      });
    }
    setAnswers(initialAnswers);
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prevAnswers => ({
      ...prevAnswers,
      [questionId]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!selectedTask) return;
    try {
      setIsLoading(true);
      setError(null);
      setSubmissionStatus(null);
      const response = await emailApi.submitAnswersForEmail(selectedTask.id, answers, null);
      setSubmissionStatus(response.data.message + (response.data.nextStep ? ` Next: ${response.data.nextStep}` : ''));
      setInputTasks(prevTasks => prevTasks.filter(task => task.id !== selectedTask.id));
      setSelectedTask(null); 
    } catch (err) {
      console.error('Failed to submit answers:', err);
      setError('Failed to submit answers for this item. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTask = async (taskIdToDelete, event) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this task?')) {
      setDeletingTaskId(taskIdToDelete);
      setError(null);
      try {
        await emailApi.deleteTask(taskIdToDelete);
        setInputTasks(prevTasks => prevTasks.filter(task => task.id !== taskIdToDelete));
        if (selectedTask && selectedTask.id === taskIdToDelete) {
          setSelectedTask(null);
        }
      } catch (err) {
        console.error('Failed to delete task:', err);
        setError(`Failed to delete task ${taskIdToDelete}. Please try again.`);
      } finally {
        setDeletingTaskId(null);
      }
    }
  };

  if (isLoading && inputTasks.length === 0 && !error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading tasks...</Typography>
      </Box>
    );
  }

  if (error && !selectedTask) {
    return <Container sx={{mt: 4}}><Alert severity="error">{error}</Alert></Container>;
  }

  if (!selectedTask) {
    if (inputTasks.length === 0 && !isLoading) {
      return <Container sx={{mt: 4}}><Alert severity="info">No emails currently need your input. Well done!</Alert></Container>;
    }
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Emails Needing Input
        </Typography>
        <Typography variant="subtitle1" gutterBottom sx={{ mb: 2 }}>
          Welcome, {currentUser?.name || currentUser?.email || 'User'}! Select an email to process.
        </Typography>
        {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
        <Paper elevation={2} sx={{p:0, width: '100%' }}>
          <List disablePadding>
            {inputTasks.map((task, index) => (
              <React.Fragment key={task.id}>
                <ListItem 
                  secondaryAction={
                    <MuiIconButton 
                      edge="end" 
                      aria-label="delete task"
                      onClick={(e) => handleDeleteTask(task.id, e)}
                      disabled={deletingTaskId === task.id}
                    >
                      {deletingTaskId === task.id ? <CircularProgress size={20} /> : <DeleteIcon />}
                    </MuiIconButton>
                  }
                  disablePadding
                >
                  <ListItemButton onClick={() => handleTaskSelect(task)}>
                    <ListItemText 
                      primary={task.originalEmail.subject}
                      secondary={`From: ${task.originalEmail.sender}`}
                    />
                  </ListItemButton>
                </ListItem>
                {index < inputTasks.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <MuiIconButton onClick={() => setSelectedTask(null)} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </MuiIconButton>
        <Typography variant="h5" component="h1">
          Process Email Input
        </Typography>
      </Box>
      
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Original Email
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>From:</strong> {selectedTask.originalEmail.sender}
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 'medium', mt: 1 }}>
          {selectedTask.originalEmail.subject}
        </Typography>
        <Box component="pre" sx={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          mt: 2, p: 2, backgroundColor: 'grey.100',
          borderRadius: 1, maxHeight: '200px', overflowY: 'auto', fontFamily: 'inherit'
        }}>
          {selectedTask.originalEmail.body}
        </Box>
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Questions to Answer
        </Typography>
        {selectedTask.questions.map(q => (
          <Box key={q.id} sx={{ mb: 2.5 }}>
            <Typography variant="body1" component="label" htmlFor={q.id} sx={{ display: 'block', fontWeight: 'medium', mb: 0.5 }}>
              {q.text}
            </Typography>
            <TextField
              id={q.id}
              value={answers[q.id] || ''}
              onChange={e => handleAnswerChange(q.id, e.target.value)}
              multiline
              rows={3}
              fullWidth
              variant="outlined"
            />
          </Box>
        ))}
      </Paper>

      {submissionStatus && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {submissionStatus}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isLoading ? 'Submitting...' : 'Accept & Send to Backend'}
        </Button>
      </Box>
    </Container>
  );
}

export default InputProcessingPage; 