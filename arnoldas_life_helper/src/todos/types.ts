export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  description?: string;
}

export interface TodoList {
  items: TodoItem[];
  entityId: string;
}
