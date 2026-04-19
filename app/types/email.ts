export interface Sender {
  name: string
  email: string
  avatarUrl?: string
}

export interface Attachment {
  name: string
  type: string
  size: string
}

export interface EmailMessage {
  id: string
  sender: Sender
  subject: string
  body: string
  timestamp: Date
  threadCount?: number
  attachments?: Attachment[]
  explanation?: string
}

export interface AISuggestion {
  id: string
  action: 'reply' | 'handled' | 'delegate' | 'task'
  description: string
  confidence: number
}

export type QueuePhase = 'high-priority' | 'processing' | 'low-priority' | 'complete'

export type EmailAction = 'reply' | 'handled' | 'delegate' | 'task'
