import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  CheckSquare, 
  Bell, 
  Bot, 
  ChevronLeft, 
  ChevronRight, 
  Sun, 
  Moon, 
  Folder,
  FolderKanban,
  Sparkles
} from 'lucide-react';
import { useStore } from '../../store/storeContext';
import { EventSwitcher } from './EventSwitcher';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openCommandPalette: () => void;
  openAIAgent: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  openCommandPalette,
  openAIAgent
}) => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 1024 && window.innerWidth > 768
  );
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { events, activeEventId, setActiveEventId } = useStore();

  // Auto-collapse when the viewport crosses into the tablet range (spec: "Tablet: Collapsible sidebar").
  React.useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w <= 1024 && w > 768) setCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'events', label: 'Events', icon: FolderKanban },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const handleEventClick = (eventId: string) => {
    setActiveEventId(eventId);
    setCurrentTab('workspace');
  };

  return (
    <aside 
      style={{
        width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden'
      }}
    >
      {/* Brand Header */}
      <div 
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: '0 1.25rem',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => { setActiveEventId(null); setCurrentTab('dashboard'); }}>
            <Sparkles size={20} color="var(--primary)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
              EventPilot
            </span>
          </div>
        )}
        {collapsed && (
          <Sparkles size={22} color="var(--primary)" style={{ cursor: 'pointer' }} onClick={() => { setActiveEventId(null); setCurrentTab('dashboard'); }} />
        )}
        
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="btn-icon"
          style={{ border: 'none', background: 'transparent' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Global Command Palette search shortcut */}
      <div style={{ padding: '0.75rem 1rem' }}>
        <button
          onClick={openCommandPalette}
          className="btn"
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            justifyContent: 'flex-start',
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            borderRadius: '6px',
            gap: '0.5rem'
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {!collapsed && (
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Search / Ask...</span>
              <kbd style={{
                fontSize: '0.7rem',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-color)',
                padding: '1px 5px',
                borderRadius: '4px',
                color: 'var(--text-tertiary)'
              }}>⌘K</kbd>
            </div>
          )}
        </button>
      </div>

      {/* Event Switcher */}
      {!collapsed && (
        <div style={{ padding: '0.75rem 1rem' }}>
          <EventSwitcher 
            activeEventId={activeEventId}
            onSelectEvent={handleEventClick}
          />
        </div>
      )}

      {/* Main Nav Items */}
      <nav style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id && activeEventId === null;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveEventId(null);
                setCurrentTab(item.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                background: isActive ? 'var(--primary-glow)' : 'transparent',
                border: 'none',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                justifyContent: collapsed ? 'center' : 'flex-start'
              }}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {/* Divider */}
        <hr style={{ border: 'none', borderBottom: '1px solid var(--border-color)', margin: '1rem 0' }} />

        {/* Active Workspaces List */}
        {!collapsed && (
          <div style={{ padding: '0 0.75rem 0.5rem 0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              Active Workspaces
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', maxHeight: '180px' }}>
          {events.map(ev => {
            const isActive = activeEventId === ev.id;
            return (
              <button
                key={ev.id}
                onClick={() => handleEventClick(ev.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                  border: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 500 : 400,
                  transition: 'all 0.2s',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
                title={ev.name}
              >
                <Folder size={16} style={{ color: isActive ? 'var(--primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                {!collapsed && (
                  <span style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {ev.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer Area */}
      <div 
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '1rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}
      >
        {/* Ask AI Agent Trigger */}
        <button
          onClick={openAIAgent}
          className="btn"
          style={{
            backgroundColor: 'var(--primary)',
            color: '#fff',
            width: '100%',
            justifyContent: 'center',
            fontSize: '0.85rem',
            padding: '0.5rem',
            borderRadius: '6px',
            gap: '0.5rem',
            border: 'none'
          }}
        >
          <Bot size={16} />
          {!collapsed && <span>Ask AI Agent</span>}
        </button>

        {/* Theme and Settings Controls */}
        <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
          <button 
            onClick={toggleTheme}
            className="btn-icon" 
            style={{ border: 'none' }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {!collapsed && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              v1.0.0
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
