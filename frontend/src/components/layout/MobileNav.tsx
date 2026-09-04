import React from 'react';
import { LayoutDashboard, Calendar, CheckSquare, FolderKanban, Bot } from 'lucide-react';
import { useStore } from '../../store/storeContext';

interface MobileNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openAIAgent: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ 
  currentTab, 
  setCurrentTab, 
  openAIAgent 
}) => {
  const { activeEventId, setActiveEventId } = useStore();

  const items = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'events', label: 'Events', icon: FolderKanban },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'ai-trigger', label: 'AI', icon: Bot, isSpecial: true }
  ];

  const handleTabClick = (itemId: string) => {
    if (itemId === 'ai-trigger') {
      openAIAgent();
    } else {
      setActiveEventId(null);
      setCurrentTab(itemId);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'none', // Managed via media queries or inline style detection in parent
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 99,
        padding: '0.25rem 0.5rem',
      }}
      className="mobile-only-nav"
    >
      <style>{`
        @media (max-width: 768px) {
          .mobile-only-nav {
            display: flex !important;
          }
        }
      `}</style>
      
      {items.map(item => {
        const Icon = item.icon;
        const isActive = currentTab === item.id && activeEventId === null;
        
        if (item.isSpecial) {
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--primary)',
                color: '#fff',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 10px var(--primary-glow)',
                transform: 'translateY(-10px)',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={20} />
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => handleTabClick(item.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: isActive ? 600 : 400,
              gap: '0.2rem',
              width: '60px'
            }}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
