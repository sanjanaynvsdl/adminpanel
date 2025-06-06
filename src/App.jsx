import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import AdminPanel from './AdminPanel';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);

  // Check authentication status on component mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userDataStr = localStorage.getItem('user_data');
    
    if (token && userDataStr) {
      try {
        const userData = JSON.parse(userDataStr);
        setIsAuthenticated(true);
        setUserData(userData);
      } catch (error) {
        console.error('Error parsing user data:', error);
        // Clear invalid data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        setIsAuthenticated(false);
        setUserData(null);
      }
    }
  }, []);

  // Protected Route component
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLoginSuccess={(user) => {
              setIsAuthenticated(true);
              setUserData(user);
            }} />
          )
        } 
      />
      <Route 
        path="/dashboard" 
        element={
            <AdminPanel 
              userData={userData} 
              onLogout={() => {
                setIsAuthenticated(false);
                setUserData(null);
              }} 
            />
          
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
