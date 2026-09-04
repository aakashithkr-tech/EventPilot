export type EventStatus = 'on-track' | 'needs-attention' | 'at-risk';
export type EventType = 'hackathon' | 'competition' | 'conference' | 'workshop';

export interface Event {
  id: string;
  name: string;
  type: EventType;
  description: string;
  websiteUrl?: string;
  status: EventStatus;
  finalDeadline: string; // ISO String or date format
  progress: number; // 0 to 100
  healthScore: number; // 0 to 100
  teamSize: number;
  nextAction: string;
  /** The user who created the event. */
  ownerId?: string;
  /** User ids with access to this event (owner is always included). */
  members?: string[];
}

export interface Deadline {
  id: string;
  eventId: string;
  title: string;
  date: string;
  type: 'official' | 'ai-recommended' | 'personal' | 'team';
  verified: boolean;
}

export interface Requirement {
  id: string;
  eventId: string;
  title: string;
  completed: boolean;
  description?: string;
  requiredBy: string;
  sourceLink?: string;
  verified: boolean;
}

export interface Resource {
  id: string;
  eventId: string;
  name: string;
  type: 'template' | 'document' | 'link';
  fileType: string; // e.g., 'PPT', 'PDF', 'GitHub', 'URL'
  source: string;
  url: string;
}

export interface TeamMember {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  role: string;
  workload: number; // 0 to 100
  avatar?: string;
}

export interface Task {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  /** Real EventPilot user id — must be an active member of this event. */
  assigneeId?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in-progress' | 'done';
  requirementId?: string;
  /** Populated by the backend on task list/create/update endpoints. */
  assignee?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  createdBy?: string;
}

export interface Notification {
  id: string;
  eventId?: string;
  title: string;
  message: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  timestamp: string; // e.g. "2h ago" or "Yesterday"
  read: boolean;
  milestoneKey?: string; // deduplication key for preparation-aware smart alerts
}

export interface ConnectedSource {
  id: string;
  eventId: string;
  userId: string;
  type: 'gmail' | 'whatsapp';
  status: 'active' | 'revoked' | 'error';
  displayName: string;
  externalId?: string;
  senderEmails: string[];
  matchKeywords: string[];
  lastSyncedAt?: string;
  lastMessageAt?: string;
  lastError?: string;
}

export interface EventUpdate {
  id: string;
  eventId: string;
  type: 'deadline-change' | 'requirement-added' | 'announcement';
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    oldValue?: string;
    newValue?: string;
  };
}

// Authentication & User Management
export type UserRole = 'organizer' | 'member' | 'student' | 'developer' | 'founder' | 'researcher' | 'professional';
export type MembershipRole = 'owner' | 'admin' | 'lead' | 'developer' | 'researcher' | 'organizer' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: UserRole;
  createdAt: string;
  preferences?: {
    darkMode?: boolean;
    emailNotifications?: boolean;
  };
}

export interface EventMembership {
  id: string;
  eventId: string;
  userId: string;
  role: MembershipRole;
  status: 'active' | 'inactive';
  joinedAt: string;
  /** Populated by the backend on team-roster endpoints; absent elsewhere. */
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

export interface EventInvitation {
  id: string;
  eventId: string;
  email: string;
  invitedByUserId: string;
  role: MembershipRole;
  status: InvitationStatus;
  createdAt: string;
  expiresAt?: string;
  /** Populated on GET /invitations/mine so pending-invite UI can show the event name without a second fetch. */
  event?: {
    id: string;
    name: string;
    type: string;
  };
}
