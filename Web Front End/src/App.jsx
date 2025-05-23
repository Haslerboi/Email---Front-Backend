import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EmailProvider } from './contexts/EmailContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DebugPage from './pages/DebugPage';
import InputProcessingPage from './pages/InputProcessingPage';

// Create a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#f50057',
    },
  },
});

// Protected route component
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  return children;
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AuthProvider>
          <EmailProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<InputProcessingPage />} />
                <Route path="debug" element={<DebugPage />} />
              </Route>
            </Routes>
          </EmailProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
