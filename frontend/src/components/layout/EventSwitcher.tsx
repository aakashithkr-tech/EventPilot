import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useStore } from '../../store/storeContext';
import { useAuth } from '../../store/authContext';

interface EventSwitcherProps {
  onSelectEvent: (eventId: string) => void;
  activeEventId: string | null;
}

export const EventSwitcher: React.FC<EventSwitcherProps> = ({ onSelectEvent, activeEventId }) => {
  const { events } = useStore();
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!currentUser) return null;

  // `events` from the store is already scoped to events this user owns or
  // is a member of (enforced server-side), so no separate membership
  // filter is needed here.
  const activeEvent = events.find(e => e.id === activeEventId);
  const displayEvent = activeEvent || events[0];

  if (events.length === 0) return null;

  return (
    <div style={{ position: 'relative', marginBottom: '24px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'all 0.2s'
        }}
      >
        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
            CURRENT EVENT
          </div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayEvent?.name || 'No event selected'}
          </div>
        </div>
        <ChevronDown
          size={16}
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            overflow: 'hidden',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          {events.map(event => {
            const isActive = activeEventId === event.id;

            return (
              <button
                key={event.id}
                onClick={() => {
                  onSelectEvent(event.id);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: '4px',
                  padding: '12px 16px',
                  background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{event.name}</span>
                  {isActive && (
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                      ✓ Active
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>{event.type}</span>
                  <span>•</span>
                  <span>
                    {(event.members?.length ?? 1)} member{(event.members?.length ?? 1) !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999
          }}
        />
      )}
    </div>
  );
};
