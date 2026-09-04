import React, { useState } from 'react';
import { Bell, Search, Bot, ChevronRight, User, LogOut, Settings } from 'lucide-react';
import { useStore } from '../../store/storeContext';
import { useAuth } from '../../store/authContext';

interface HeaderProps {
  openCommandPalette: () => void;
  setCurrentTab: (tab: string) => void;
  currentTab: string;
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  events: 'Events',
  schedule: 'Schedule',
  tasks: 'Tasks',
  notifications: 'Notifications',
  settings: 'Settings'
};

export const Header: React.FC<HeaderProps> = ({ openCommandPalette, setCurrentTab, currentTab }) => {
  const { events, activeEventId, notifications, setActiveEventId } = useStore();
  const { currentUser, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const activeEvent = events.find(e => e.id === activeEventId);
  const unreadNotifications = notifications.filter(n => !n.read);
  const tabLabel = TAB_LABELS[currentTab] || 'Dashboard';

  const handleLogout = () => {
    logout();
    setShowProfileMenu(false);
  };

  return (
    <header
      style={{
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        backgroundColor: 'var(--bg-secondary)',
        position: 'sticky',
        top: 0,
        zIndex: 90
      }}
    >
      {/* Breadcrumb Workspace Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
        <span 
          onClick={() => { setActiveEventId(null); setCurrentTab('dashboard'); }}
          style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          EventPilot
        </span>
        <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
        {activeEvent ? (
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {activeEvent.name}
          </span>
        ) : (
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {tabLabel}
          </span>
        )}
      </div>

      {/* Middle/Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* Quick Search */}
        <div 
          onClick={openCommandPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            padding: '0.4rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            width: '240px',
          }}
        >
          <Search size={16} />
          <span>Quick command search...</span>
        </div>

        {/* AI Agent Status */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.6rem',
            borderRadius: '4px',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            backgroundColor: 'var(--primary-glow)',
            color: 'var(--primary)',
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          <Bot size={14} />
          <span>AI Active</span>
        </div>

        {/* Notification Bell */}
        <button
          onClick={() => { setActiveEventId(null); setCurrentTab('notifications'); }}
          style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer' }}
          className="btn-icon"
        >
          <Bell size={18} />
          {unreadNotifications.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--status-atrisk)',
                border: '1.5px solid var(--bg-secondary)'
              }}
            />
          )}
        </button>

        {/* Profile Avatar with Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            {currentUser?.avatar || 'U'}
          </button>

          {/* Dropdown Menu */}
          {showProfileMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                minWidth: '200px',
                zIndex: 1000,
                overflow: 'hidden'
              }}
            >
              {/* User Info */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {currentUser?.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {currentUser?.email}
                </div>
              </div>

              {/* Menu Items */}
              <button
                onClick={() => {
                  setCurrentTab('settings');
                  setShowProfileMenu(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left'
                }}
              >
                <Settings size={16} />
                Settings
              </button>

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--status-atrisk)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                  borderTop: '1px solid var(--border-color)'
                }}
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Close dropdown when clicking outside */}
      {showProfileMenu && (
        <div
          onClick={() => setShowProfileMenu(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999
          }}
        />
      )}
    </header>
  );
};
