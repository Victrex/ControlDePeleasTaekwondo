import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/shared/Login';
import Dashboard from './components/admin/Dashboard';
import Awards from './components/admin/Awards';
import ScoringControl from './components/admin/ScoringControl';
import Analytics from './components/admin/Analytics';
import AthleteRegistry from './components/admin/AthleteRegistry';
import CategoryManager from './components/admin/CategoryManager';
import QuickCheckIn from './components/admin/QuickCheckIn';
import BulkImport from './components/admin/BulkImport';
import BeltConfig from './components/admin/BeltConfig';
import PublicDisplay from './components/public/PublicDisplay';
import Scoreboard from './components/scoreboard/Scoreboard';
import JudgePanel from './components/judge/JudgePanel';
import './App.css';

function ProtectedRoute({ children }) {
  const { authenticated, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!authenticated || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/public/:tournamentId?" element={<PublicDisplay />} />
          <Route path="/scoreboard/:fightId" element={<Scoreboard />} />
          <Route path="/judge/:fightId" element={<JudgePanel />} />
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/scoring/:fightId" 
            element={
              <ProtectedRoute>
                <ScoringControl />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/awards" 
            element={
              <ProtectedRoute>
                <Awards />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/analytics" 
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/athletes" 
            element={
              <ProtectedRoute>
                <AthleteRegistry />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/categories" 
            element={
              <ProtectedRoute>
                <CategoryManager />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/quick-checkin" 
            element={
              <ProtectedRoute>
                <QuickCheckIn />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/bulk-import" 
            element={
              <ProtectedRoute>
                <BulkImport />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/belt-config" 
            element={
              <ProtectedRoute>
                <BeltConfig />
              </ProtectedRoute>
            } 
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  );
}

export default App;
