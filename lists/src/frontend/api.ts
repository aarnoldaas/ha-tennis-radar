import type { HomeList, ListItem, StateResponse } from '../shared/types';

declare global {
  interface Window { INGRESS_PATH?: string; }
}

const base = () => window.INGRESS_PATH || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  state: () => request<StateResponse>('/api/state'),
  addList: (body: Partial<HomeList>) => request('/api/lists', { method: 'POST', body: JSON.stringify(body) }),
  updateList: (id: string, body: Partial<HomeList>) => request(`/api/lists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteList: (id: string) => request(`/api/lists/${id}`, { method: 'DELETE' }),
  addItem: (body: Partial<ListItem>) => request('/api/items', { method: 'POST', body: JSON.stringify(body) }),
  updateItem: (id: string, body: Partial<ListItem>) => request(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteItem: (id: string) => request(`/api/items/${id}`, { method: 'DELETE' }),
  clearCompleted: (listIds?: string[]) => request('/api/completed/clear', { method: 'POST', body: JSON.stringify({ listIds }) }),
};
