import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Sparkles, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/storeContext';
import { handleAgentChat, AIChatResponse } from '../../services/aiService';

interface AIAgentProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  sender: 'user' | 'agent';
  text: string;
  actionConfirm?: AIChatResponse['suggestedAction'];
  isCompleted?: boolean;
}

export const AIAgent: React.FC<AIAgentProps> = ({ isOpen, onClose }) => {
  const {
    events,
    tasks,
    teamMembers,
    requirements,
    activeEventId,
    addTeamMember,
    addTask,
    moveTeamMember,
    triggerDeadlineChangeSimulation,
    addNotification
  } = useStore();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'agent',
      text: "🤖 **Welcome to your EventPilot Command Center.**\n\nWhat would you like to take care of today? Paste an event link, ask about upcoming deadlines, or assign work to your team."
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<AIChatResponse['suggestedAction'] | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { sender: 'user', text: textToSend }]);
    setInput('');
    setIsTyping(true);

    // Call service with current context
    setTimeout(() => {
      const response = handleAgentChat(textToSend, activeEventId, {
        events,
        tasks,
        teamMembers,
        requirements
      });

      setIsTyping(false);
      
      const newMsg: Message = { sender: 'agent', text: response.text };
      
      if (response.suggestedAction && response.suggestedAction.type !== 'none') {
        newMsg.actionConfirm = response.suggestedAction;
        // Also set active confirmation overlay in agent state
        setActionConfirm(response.suggestedAction);
      }

      setMessages(prev => [...prev, newMsg]);
    }, 1000);
  };

  const handleConfirmAction = () => {
    if (!actionConfirm) return;

    const { type, payload } = actionConfirm;

    if (type === 'add-member') {
      addTeamMember({
        eventId: payload.eventId,
        userId: payload.userId || 'u-new',
        name: payload.name,
        role: payload.role,
        workload: payload.workload
      });
      
      addNotification({
        eventId: payload.eventId,
        title: 'Team Updated via AI',
        message: `${payload.name} was successfully added as ${payload.role}.`,
        type: 'success',
        timestamp: 'Just now'
      });
    } else if (type === 'add-task') {
      addTask({
        eventId: payload.eventId,
        title: payload.title,
        assigneeId: payload.assigneeId,
        priority: 'medium',
        status: 'todo'
      });

      addNotification({
        eventId: payload.eventId,
        title: 'Task Assigned via AI',
        message: `"${payload.title}" was assigned to ${payload.assigneeName}.`,
        type: 'success',
        timestamp: 'Just now'
      });
    } else if (type === 'sim-deadline') {
      triggerDeadlineChangeSimulation(payload.eventId);
    } else if (type === 'move-member') {
      // moveTeamMember already fires its own notification internally.
      moveTeamMember(payload.memberId, payload.toEventId);
    }

    // Add confirmation feedback in chat
    setMessages(prev => {
      // Mark last action as completed
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.actionConfirm) {
        last.isCompleted = true;
      }
      return [
        ...updated,
        {
          sender: 'agent',
          text: `✅ **Action confirmed and executed successfully.**`
        }
      ];
    });

    setActionConfirm(null);
  };

  const handleCancelAction = () => {
    setActionConfirm(null);
    setMessages(prev => [
      ...prev,
      {
        sender: 'agent',
        text: `❌ **Action cancelled.**`
      }
    ]);
  };

  const suggestedQueries = [
    "What do I need to finish today?",
    "Which events are at risk?",
    "Add Riya to this team",
    "Assign the pitch deck to Aarish",
    "Simulate a deadline extension"
  ];

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        maxWidth: '100%',
        height: '100vh',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1.25rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            backgroundColor: 'var(--primary-glow)',
            color: 'var(--primary)',
            padding: '0.4rem',
            borderRadius: '8px'
          }}>
            <Bot size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>EventPilot Agent</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--status-ontrack)' }}>● Online</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-icon" style={{ border: 'none' }}>
          <X size={18} />
        </button>
      </div>

      {/* Message Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}
      >
        {messages.map((msg, i) => (
          <div 
            key={i} 
            style={{ 
              display: 'flex', 
              gap: '0.75rem', 
              flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start'
            }}
          >
            {/* Avatar */}
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: msg.sender === 'user' ? 'var(--bg-tertiary)' : 'var(--primary-glow)',
              color: msg.sender === 'user' ? 'var(--text-secondary)' : 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Bubble */}
            <div style={{ flex: 1, maxWidth: '80%' }}>
              <div
                style={{
                  backgroundColor: msg.sender === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                  border: msg.sender === 'user' ? 'none' : '1px solid var(--border-color)',
                  color: msg.sender === 'user' ? '#fff' : 'var(--text-primary)',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-line'
                }}
              >
                {msg.text}
              </div>

              {/* Action confirmation dialog card */}
              {msg.actionConfirm && !msg.isCompleted && actionConfirm === msg.actionConfirm && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    backgroundColor: 'rgba(99, 102, 241, 0.05)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                    <AlertCircle size={16} />
                    <span>AI Action Confirmation Required</span>
                  </div>

                  {msg.actionConfirm.type === 'add-member' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      I'll add <strong>{msg.actionConfirm.payload.name}</strong> to:
                      <div style={{ margin: '0.35rem 0', padding: '0.25rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                        {events.find(e => e.id === msg.actionConfirm?.payload.eventId)?.name || 'Event Workspace'}
                      </div>
                      Role: {msg.actionConfirm.payload.role}<br/>
                      Workload allocation: 10%
                    </div>
                  )}

                  {msg.actionConfirm.type === 'sim-deadline' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Adjust final deadline +3 days for:
                      <div style={{ margin: '0.35rem 0', padding: '0.25rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                        {events.find(e => e.id === msg.actionConfirm?.payload.eventId)?.name || 'Event Workspace'}
                      </div>
                      The entire preparation plan will recalculate.
                    </div>
                  )}

                  {msg.actionConfirm.type === 'add-task' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      I'll create <strong>"{msg.actionConfirm.payload.title}"</strong> and assign it to <strong>{msg.actionConfirm.payload.assigneeName}</strong> on:
                      <div style={{ margin: '0.35rem 0', padding: '0.25rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                        {events.find(e => e.id === msg.actionConfirm?.payload.eventId)?.name || 'Event Workspace'}
                      </div>
                      Priority: Medium
                    </div>
                  )}

                  {msg.actionConfirm.type === 'move-member' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Move <strong>{msg.actionConfirm.payload.memberName}</strong> from <strong>{msg.actionConfirm.payload.fromEventName}</strong> to:
                      <div style={{ margin: '0.35rem 0', padding: '0.25rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                        {msg.actionConfirm.payload.toEventName}
                      </div>
                      They'll stop receiving notifications for the old event.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={handleConfirmAction} 
                      className="btn btn-primary" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
                    >
                      Confirm Action
                    </button>
                    <button 
                      onClick={handleCancelAction} 
                      className="btn btn-secondary" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-glow)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bot size={14} />
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', padding: '0.5rem' }}>
              <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'scanLine 1s infinite alternate' }} />
              <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'scanLine 1s infinite alternate 0.2s' }} />
              <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'scanLine 1s infinite alternate 0.4s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Queries Chips */}
      {messages.length === 1 && (
        <div style={{ padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>SUGGESTED COMMANDS</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {suggestedQueries.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '999px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                • {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSend(input);
        }}
        style={{
          padding: '1.25rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          gap: '0.5rem'
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask anything or command AI..."
          className="input-field"
          style={{ flex: 1, padding: '0.6rem 0.85rem' }}
          disabled={actionConfirm !== null}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ padding: '0.6rem', borderRadius: '8px' }}
          disabled={actionConfirm !== null || !input.trim()}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
