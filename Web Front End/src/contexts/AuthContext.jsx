import { createContext, useState, useContext, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user data on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (import.meta.env.DEV) {
          // Development mode: Bypass token check and set a mock user
          console.warn('AuthContext: DEV mode, bypassing real auth and setting mock user.');
          setCurrentUser({
            id: 'dev-user-1',
            name: 'Dev User',
            email: 'dev@example.com',
            // Add any other fields your components might expect on a user object
          });
          setLoading(false);
          return;
        }
        
        // Production mode: Check if we have a token
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }
        
        // Fetch current user data
        const response = await authApi.getCurrentUser();
        setCurrentUser(response.data);
      } catch (err) {
        console.error('Auth loading error:', err);
        // Clear any invalid tokens
        localStorage.removeItem('token');
        setError('Authentication session expired. Please log in again.');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (email, password) => {
    // In DEV mode with mock user, this login function might not be strictly necessary
    // or could be adapted. For now, keeping original logic.
    // If you call login() in DEV mode, it will overwrite the mock user.
    try {
      setLoading(true);
      setError(null);
      
      const response = await authApi.login(email, password);
      
      // Save token
      if (response.data && response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      
      // Set user data
      setCurrentUser(response.data.user || { email });
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Failed to log in');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // In DEV mode, if you want logout to clear the mock user, ensure it does.
      // Or, if logout redirects to a login page, this might be fine.
      if (!import.meta.env.DEV) { // Only call API if not in DEV mode with mock auth
      await authApi.logout();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear token and user data regardless of API success
      localStorage.removeItem('token');
      setCurrentUser(null); // This will clear the mock user in DEV mode too
      if (import.meta.env.DEV) {
        console.warn('AuthContext: DEV mode, user logged out. To re-login, refresh page.');
      }
    }
  };

  const value = {
    currentUser,
    login,
    logout,
    loading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 