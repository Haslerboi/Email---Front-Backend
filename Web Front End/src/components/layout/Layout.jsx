import { Container, Box } from '@mui/material';
import Header from './Header';
import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      alignItems: 'center'
    }}>
      <Header />
      <Container 
        component="main" 
        sx={{ 
          width: '100%',
          maxWidth: 'lg',
          flexGrow: 1, 
          py: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Outlet />
      </Container>
    </Box>
  );
} 