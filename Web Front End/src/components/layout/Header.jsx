import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ApiStatus from './ApiStatus';

export default function Header() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { title: 'Inbox', path: '/' },
    { title: 'Drafts', path: '/drafts' },
    { title: 'Questions', path: '/questions' },
    { title: 'History', path: '/history' },
    { title: 'Debug', path: '/debug' }
  ];

  const handleNavClick = (path) => {
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Email Assistant
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 3 }}>
          <ApiStatus />
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          {navItems.map((item) => (
            <Button 
              key={item.path}
              color="inherit"
              onClick={() => handleNavClick(item.path)}
              sx={{ 
                fontWeight: location.pathname === item.path ? 'bold' : 'normal',
                textDecoration: location.pathname === item.path ? 'underline' : 'none'
              }}
            >
              {item.title}
            </Button>
          ))}
          {currentUser && (
            <Button color="inherit" onClick={handleLogout}>
              Logout
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
} 