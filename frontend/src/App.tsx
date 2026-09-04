import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './store/storeContext';
import { AuthProvider, useAuth } from './store/authContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { EventWorkspace } from './pages/EventWorkspace';
import { Schedule } from './pages/Schedule';
import { Tasks } from './pages/Tasks';
import { Notifications } from './pages/Notifications';
import { Settings } from './pages/Settings';
import { AIAgent } from './components/ai/AIAgent';
import { CommandPalette } from './components/ai/CommandPalette';
import DeadlineChangeToast from './components/ui/DeadlineChangeToast';

function AppContent() {
  const { activeEventId, setActiveEventId } = useStore();
  const { isAuthenticated, isAuthReady } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('landing'); // Default view
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAIAgentOpen, setIsAIAgentOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup' | 'forgot-password' | null>(null);
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState<'overview' | 'sources'>('overview');

  // Listen for keyboard Cmd+K or Ctrl+K to open search palette
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('source_connected');
    const eventIdFromSource = params.get('eventId');
    if (connected === 'gmail' && eventIdFromSource) {
      setActiveEventId(eventIdFromSource);
      setCurrentTab('workspace');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // If user is not authenticated and tries to access protected routes, redirect to login
  const protectedRoutes = ['dashboard', 'events', 'workspace', 'schedule', 'tasks', 'notifications', 'settings'];
  const needsAuth = protectedRoutes.includes(currentTab);

  if (!isAuthenticated && needsAuth && authTab === null) {
    setAuthTab('login');
  }

  // Wait for the stored token to be verified against the backend before
  // rendering anything auth-dependent, so a refresh doesn't flash the
  // login screen for an already-logged-in user.
  if (!isAuthReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
        }}
      >
        Loading EventPilot…
      </div>
    );
  }

  // Authentication flows
  if (authTab === 'login') {
    return (
      <Login
        onSuccessfulLogin={() => {
          setAuthTab(null);
          setCurrentTab('dashboard');
        }}
        onNavigateToSignup={() => setAuthTab('signup')}
        onNavigateToForgotPassword={() => setAuthTab('forgot-password')}
      />
    );
  }

  if (authTab === 'signup') {
    return (
      <Signup
        onSuccessfulSignup={() => {
          setAuthTab(null);
          setCurrentTab('onboarding');
        }}
        onNavigateToLogin={() => setAuthTab('login')}
      />
    );
  }

  if (authTab === 'forgot-password') {
    return (
      <ForgotPassword
        onBackToLogin={() => setAuthTab('login')}
      />
    );
  }

  // Landing view render (public)
  if (currentTab === 'landing') {
    return (
      <Landing 
        onStartOnboarding={() => {
          if (isAuthenticated) {
            setCurrentTab('onboarding');
          } else {
            setAuthTab('signup');
          }
        }}
        onSkipToDashboard={() => {
          if (isAuthenticated) {
            setCurrentTab('dashboard');
          } else {
            setAuthTab('login');
          }
        }}
      />
    );
  }

  // Onboarding view render (protected)
  if (currentTab === 'onboarding') {
    if (!isAuthenticated) {
      setAuthTab('login');
      return null;
    }
    return (
      <Onboarding 
        onBack={() => setCurrentTab('landing')}
        onFinish={(eventId) => {
          setActiveEventId(eventId);
          setCurrentTab('workspace');
        }}
      />
    );
  }

  // Protect all other routes
  if (!isAuthenticated) {
    setAuthTab('login');
    return null;
  }

  // General core navigation page selector
  const renderViewport = () => {
    if (activeEventId !== null && currentTab === 'workspace') {
      return (
        <EventWorkspace 
          onBack={() => {
            setActiveEventId(null);
            setCurrentTab('dashboard');
          }}
          openAIAgent={() => setIsAIAgentOpen(true)}
          initialTab={workspaceInitialTab}
        />
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return (
          <Dashboard 
          onStartOnboarding={() => setCurrentTab('onboarding')}
            onSelectEvent={(id) => {
              setActiveEventId(id);
              setWorkspaceInitialTab('overview');
              setCurrentTab('workspace');
            }}
            onOpenSources={(id) => {
  setActiveEventId(id);
  setWorkspaceInitialTab('sources');
  setCurrentTab('workspace');
}}
          />
          
        );
      case 'events':
        return (
          <Events
            onSelectEvent={(id) => {
              setActiveEventId(id);
              setWorkspaceInitialTab('overview');
              setCurrentTab('workspace');
            }}
            onOpenSources={(id) => {
              setActiveEventId(id);
              setWorkspaceInitialTab('sources');
              setCurrentTab('workspace');
            }}
            onStartOnboarding={() => setCurrentTab('onboarding')}
          />
        );
      case 'schedule':
        return <Schedule />;
      case 'tasks':
        return <Tasks />;
      case 'notifications':
        return <Notifications />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onSelectEvent={(id) => { setActiveEventId(id); setWorkspaceInitialTab('overview'); setCurrentTab('workspace'); }} onStartOnboarding={() => setCurrentTab('onboarding')} 
        onOpenSources={(id) => {
  setActiveEventId(id);
  setWorkspaceInitialTab('sources');
  setCurrentTab('workspace');
}}/>;
        
    }
  };

  return (
    <div className="app-container dots-grid">
      {/* Floating Ambient Blobs */}
      <div className="blob-bg-container">
        <div className="blob-bg blob-indigo" />
        <div className="blob-bg blob-blue" />
        <div className="blob-bg blob-purple" />
      </div>

      {/* Global Sidebar - Desktop */}
      <Sidebar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openAIAgent={() => setIsAIAgentOpen(true)}
      />

      {/* Main Workspace Column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', zIndex: 1 }}>
        <Header 
          openCommandPalette={() => setIsCommandPaletteOpen(true)}
          setCurrentTab={setCurrentTab}
          currentTab={currentTab}
        />
        
        <main className="main-content">
          {renderViewport()}
        </main>
      </div>

      {/* Global Mobile navigation dock */}
      <MobileNav 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openAIAgent={() => setIsAIAgentOpen(true)}
      />

      {/* Deadline adaptation feedback */}
      <DeadlineChangeToast />

      {/* Global Overlays */}
      <CommandPalette 
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setCurrentTab={setCurrentTab}
      />

      <AIAgent 
        isOpen={isAIAgentOpen}
        onClose={() => setIsAIAgentOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </AuthProvider>
  );
}
