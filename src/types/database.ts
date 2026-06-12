import type { FlowDefinition } from './flow';

export type Sender = 'bot' | 'user' | 'admin';
export type MessageType = 'text' | 'image' | 'video';
export type ConversationStatus = 'active' | 'completed';

export interface Flow {
  id: string;
  name: string;
  definition: FlowDefinition;
  published: boolean;
  color: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowLink {
  id: string;
  flow_id: string;
  slug: string;
  active: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  flow_id: string | null;
  link_id: string | null;
  user_id: string;
  visitor_name: string | null;
  status: ConversationStatus;
  current_node_id: string | null;
  variables: Record<string, unknown>;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: Sender;
  type: MessageType;
  content: string | null;
  media_url: string | null;
  button_label: string | null;
  button_url: string | null;
  node_id: string | null;
  created_at: string;
}
