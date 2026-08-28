/**
 * Conversation correlation only — never authentication.
 * conversationId → WorkingMemory key. Possession does not grant patient authority.
 */

export interface ConversationRegistry {
  ensure(conversationId: string): Promise<void>;
  exists(conversationId: string): Promise<boolean>;
}

export class InMemoryConversationRegistry implements ConversationRegistry {
  private readonly ids = new Set<string>();

  async ensure(conversationId: string): Promise<void> {
    this.ids.add(conversationId);
  }

  async exists(conversationId: string): Promise<boolean> {
    return this.ids.has(conversationId);
  }
}
