import type { TodoItem } from './types.js';

export class TodoService {
  private token = process.env.SUPERVISOR_TOKEN ?? '';
  private baseUrl = 'http://supervisor/core/api';
  private entityId: string;

  constructor(entityId: string) {
    this.entityId = entityId;
  }

  private async callApi(path: string, method: string = 'GET', data?: Record<string, unknown>): Promise<any> {
    if (!this.token) {
      console.warn('[Todos] No SUPERVISOR_TOKEN — cannot access HA todo API');
      return null;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      ...(data && { body: JSON.stringify(data) }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HA API ${res.status}: ${body}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async getItems(): Promise<TodoItem[]> {
    const response = await this.callApi('/services/todo/get_items', 'POST', {
      entity_id: this.entityId,
    });

    // HA returns response data in the service response format
    if (response?.response?.[this.entityId]?.items) {
      return response.response[this.entityId].items;
    }

    // Fallback: try to extract from other response shapes
    if (response?.service_response?.[this.entityId]?.items) {
      return response.service_response[this.entityId].items;
    }

    // If items are directly in the response
    if (Array.isArray(response)) {
      return response;
    }

    return [];
  }

  async addItem(summary: string, description?: string): Promise<void> {
    await this.callApi('/services/todo/add_item', 'POST', {
      entity_id: this.entityId,
      item: summary,
      ...(description && { description }),
    });
  }

  async updateItem(uid: string, updates: { rename?: string; status?: 'needs_action' | 'completed'; description?: string }): Promise<void> {
    await this.callApi('/services/todo/update_item', 'POST', {
      entity_id: this.entityId,
      item: uid,
      ...updates,
    });
  }

  async removeItem(uid: string): Promise<void> {
    await this.callApi('/services/todo/remove_item', 'POST', {
      entity_id: this.entityId,
      item: uid,
    });
  }
}
