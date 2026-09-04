import { api } from './api';

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

export interface WhatsAppIntegrationStatus {
  configured: boolean;
  verifyTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  accessTokenConfigured: boolean;
  appSecretConfigured: boolean;
}

class SourceService {
  async list(eventId: string): Promise<ConnectedSource[]> {
    const result = await api.get<{ sources: ConnectedSource[] }>(`/events/${eventId}/sources`);
    return result.sources;
  }

  async beginGmailConnect(eventId: string): Promise<void> {
    const result = await api.get<{ authorizationUrl: string }>(`/events/${eventId}/sources/gmail/connect`);
    window.location.assign(result.authorizationUrl);
  }

  async connectWhatsApp(eventId: string, keywords: string[]): Promise<ConnectedSource> {
    const result = await api.post<{ source: ConnectedSource }>(`/events/${eventId}/sources/whatsapp`, { keywords });
    return result.source;
  }

  async whatsappStatus(): Promise<WhatsAppIntegrationStatus> {
    const result = await api.get<WhatsAppIntegrationStatus>('/whatsapp/status');
    return result;
  }

  async sync(eventId: string, sourceId: string): Promise<{ messagesChecked: number; matched: number; changes: number }> {
    const result = await api.post<{ result: { messagesChecked: number; matched: number; changes: number } }>(`/events/${eventId}/sources/${sourceId}/sync`, {});
    return result.result;
  }

  async disconnect(eventId: string, sourceId: string): Promise<void> {
    await api.delete(`/events/${eventId}/sources/${sourceId}`);
  }
}

export const sourceService = new SourceService();
