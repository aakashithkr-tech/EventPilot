import React, { useState, useEffect, useRef } from 'react';
import { Search, Folder, Calendar, CheckSquare, Sparkles, User, FileText, X } from 'lucide-react';
import { useStore } from '../../store/storeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setCurrentTab: (tab: string) => void;
}

interface SearchResult {
  id: string;
  title: string;
  category: 'events' | 'deadlines' | 'tasks' | 'requirements' | 'resources' | 'team';
  subtitle?: string;
  onClick: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ 
  isOpen, 
  onClose,
  setCurrentTab
}) => {
  const { 
    events, 
    deadlines, 
    tasks, 
    requirements, 
    resources, 
    teamMembers,
    setActiveEventId 
  } = useStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      // Show default suggestions (e.g. at-risk events, upcoming tasks)
      const suggestions: SearchResult[] = [];
      
      // Events
      events.slice(0, 3).forEach(e => {
        suggestions.push({
          id: `ev-${e.id}`,
          title: `Open workspace: ${e.name}`,
          category: 'events',
          subtitle: `Event type: ${e.type} | Progress: ${e.progress}%`,
          onClick: () => {
            setActiveEventId(e.id);
            setCurrentTab('workspace');
            onClose();
          }
        });
      });

      // Tasks
      tasks.slice(0, 2).forEach(t => {
        suggestions.push({
          id: `t-${t.id}`,
          title: `Focus task: ${t.title}`,
          category: 'tasks',
          subtitle: `Assigned: ${teamMembers.find(m => m.id === t.assigneeId)?.name || 'Unassigned'}`,
          onClick: () => {
            setActiveEventId(t.eventId);
            setCurrentTab('workspace');
            // Store could set workspace active subtab as well
            onClose();
          }
        });
      });

      setResults(suggestions);
      return;
    }

    const cleanQuery = query.toLowerCase().trim();
    const matches: SearchResult[] = [];

    // Filter Events
    events.forEach(e => {
      if (e.name.toLowerCase().includes(cleanQuery) || e.type.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: `ev-${e.id}`,
          title: e.name,
          category: 'events',
          subtitle: `Workspace | ${e.type} (${e.status})`,
          onClick: () => {
            setActiveEventId(e.id);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    // Filter Deadlines
    deadlines.forEach(d => {
      if (d.title.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: `d-${d.id}`,
          title: d.title,
          category: 'deadlines',
          subtitle: `Deadline | Date: ${d.date}`,
          onClick: () => {
            setActiveEventId(d.eventId);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    // Filter Tasks
    tasks.forEach(t => {
      if (t.title.toLowerCase().includes(cleanQuery) || t.description?.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: `t-${t.id}`,
          title: t.title,
          category: 'tasks',
          subtitle: `Task | Status: ${t.status} | Priority: ${t.priority}`,
          onClick: () => {
            setActiveEventId(t.eventId);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    // Filter Requirements
    requirements.forEach(r => {
      if (r.title.toLowerCase().includes(cleanQuery) || r.requiredBy.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: `r-${r.id}`,
          title: r.title,
          category: 'requirements',
          subtitle: `Requirement | Required by: ${r.requiredBy}`,
          onClick: () => {
            setActiveEventId(r.eventId);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    // Filter Resources
    resources.forEach(res => {
      if (res.name.toLowerCase().includes(cleanQuery) || res.fileType.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: `res-${res.id}`,
          title: res.name,
          category: 'resources',
          subtitle: `Resource | ${res.fileType} (${res.source})`,
          onClick: () => {
            setActiveEventId(res.eventId);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    // Filter Team Members
    teamMembers.forEach(m => {
      if (m.name.toLowerCase().includes(cleanQuery) || m.role.toLowerCase().includes(cleanQuery)) {
        const evName = events.find(e => e.id === m.eventId)?.name || 'Event';
        matches.push({
          id: `m-${m.id}`,
          title: `${m.name} (${m.role})`,
          category: 'team',
          subtitle: `Team Member | ${evName}`,
          onClick: () => {
            setActiveEventId(m.eventId);
            setCurrentTab('workspace');
            onClose();
          }
        });
      }
    });

    setResults(matches.slice(0, 10)); // Cap results
  }, [query, events, deadlines, tasks, requirements, resources, teamMembers]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getCategoryIcon = (category: SearchResult['category']) => {
    switch (category) {
      case 'events': return <Folder size={16} color="var(--primary)" />;
      case 'deadlines': return <Calendar size={16} color="var(--status-attention)" />;
      case 'tasks': return <CheckSquare size={16} color="var(--status-ontrack)" />;
      case 'requirements': return <Sparkles size={16} color="var(--status-info)" />;
      case 'resources': return <FileText size={16} color="var(--text-secondary)" />;
      case 'team': return <User size={16} color="var(--text-secondary)" />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '600px',
          maxWidth: '90%',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search input bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: '1px solid var(--border-color)',
            gap: '0.75rem',
            position: 'relative'
          }}
        >
          <Search size={20} style={{ color: 'var(--text-secondary)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type search terms (e.g. deadlines, ppt, Aarish)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              fontFamily: 'var(--font-body)'
            }}
          />
          <button 
            onClick={onClose} 
            className="btn-icon"
            style={{ border: 'none', background: 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results view */}
        <div style={{ maxHeight: '350px', overflowY: 'auto', padding: '0.5rem' }}>
          {results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {results.map((res) => (
                <button
                  key={res.id}
                  onClick={res.onClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getCategoryIcon(res.category)}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {res.title}
                    </div>
                    {res.subtitle && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        {res.subtitle}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {res.category}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No matches found for "{query}"
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)'
          }}
        >
          <div>
            Search and navigate instantly across active event parameters
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
