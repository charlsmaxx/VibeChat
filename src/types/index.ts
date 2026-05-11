export type MessageType = 'text' | 'image' | 'video' | 'audio';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface UserProfile {
  id: string;
  username: string;
  phone_number: string | null;
  avatar_url: string | null;
  bio: string | null;
  last_seen: string | null;
  is_online: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_by?: string | null;
  is_group: boolean;
  participants: string[];
  last_message: string | null;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string | null;
  group_id: string | null;
  content: string | null;
  media_url: string | null;
  type: MessageType;
  status: MessageStatus;
  created_at: string;
  local_id?: string;
}

export interface OutboxMessage {
  local_id: string;
  conversation_id: string;
  receiver_id: string | null;
  group_id: string | null;
  content: string | null;
  media_url: string | null;
  type: MessageType;
  created_at: string;
}

export interface StatusUpdate {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  expires_at: string;
}

export interface CallLogRow {
  id: string;
  caller_id: string;
  callee_id: string;
  channel: string;
  status: string;
  created_at: string;
}
