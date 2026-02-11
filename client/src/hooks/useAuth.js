import { useState, useEffect } from 'react';
import api from '../utils/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await api.checkSession();
      if (response.authenticated) {
        setUser(response.user);
        setAuthenticated(true);
      }
    } catch (error) {
      console.error('Error verificando sesión:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    try {
      const response = await api.login(username, password);
      setUser(response.user);
      setAuthenticated(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function logout() {
    try {
      await api.logout();
      setUser(null);
      setAuthenticated(false);
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    }
  }

  return {
    user,
    loading,
    authenticated,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    checkAuth
  };
}
