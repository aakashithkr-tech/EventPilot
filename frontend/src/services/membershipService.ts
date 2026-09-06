import { EventMembership, EventInvitation, MembershipRole } from '../types/index';
import { api, ApiError } from './api';

interface MembersResponse {
  members: EventMembership[];
}

interface InvitationsResponse {
  invitations: EventInvitation[];
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

class MembershipService {
  /** All active members of one event (name/email/avatar populated). */
  async getEventMembers(eventId: string): Promise<EventMembership[]> {
    const result = await api.get<MembersResponse>(`/events/${eventId}/team`);
    return result.members;
  }

  /** Add an existing EventPilot user directly to an event's team. */
  async addMembership(eventId: string, userId: string, role: MembershipRole = 'member') {
    const result = await api.post<{ member: EventMembership }>(`/events/${eventId}/team`, { userId, role });
    return result.member;
  }

  async removeMembership(eventId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await api.delete(`/events/${eventId}/team/${userId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  /** Create an in-app team invitation for an existing EventPilot account. */
  async inviteUser(
    eventId: string,
    email: string,
    role: MembershipRole = 'member'
  ): Promise<{ success: boolean; invitation?: EventInvitation; error?: string }> {
    try {
      const result = await api.post<{ invitation: EventInvitation }>(`/events/${eventId}/invitations`, {
        email,
        role,
      });
      return { success: true, invitation: result.invitation };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  /** All pending invitations sent to the current logged-in account. */
  async getPendingInvitationsForEmail(_email: string): Promise<EventInvitation[]> {
    // The backend derives the email from the authenticated session (an
    // invitation can only ever be listed/accepted/declined by the account
    // it was actually sent to), so the argument here is kept only for
    // call-site compatibility and isn't sent to the server.
    const result = await api.get<InvitationsResponse>('/invitations/mine');
    return result.invitations;
  }

  async acceptInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await api.post(`/invitations/${invitationId}/accept`);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async declineInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await api.post(`/invitations/${invitationId}/decline`);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async getEventInvitations(eventId: string): Promise<EventInvitation[]> {
    const result = await api.get<InvitationsResponse>(`/events/${eventId}/invitations`);
    return result.invitations;
  }

  async getEventMemberCount(eventId: string): Promise<number> {
    const members = await this.getEventMembers(eventId);
    return members.length;
  }
}

export const membershipService = new MembershipService();
