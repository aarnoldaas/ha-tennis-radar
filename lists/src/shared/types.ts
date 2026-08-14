export type ListKind = 'shopping' | 'todo';
export type Priority = 'low' | 'medium' | 'high';

export interface HomeList {
  id: string;
  name: string;
  kind: ListKind;
  color: string;
  createdAt: string;
}

export interface ListItem {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  quantity: string | null;
  category: string | null;
  dueDate: string | null;
  priority: Priority;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface HomeListsState {
  version: 1;
  lists: HomeList[];
  items: ListItem[];
  updatedAt: string;
}

export interface StateSummary {
  openShopping: number;
  dueToday: number;
  overdue: number;
  completedThisWeek: number;
}

export interface StateResponse extends HomeListsState {
  summary: StateSummary;
}
