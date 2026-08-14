import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HomeList, HomeListsState, ListItem, ListKind, Priority, StateResponse } from '../shared/types';

const COLORS = ['#f27d52', '#dfad42', '#4d9c7d', '#5888c7', '#8a6bc1', '#d36988'];

const now = () => new Date().toISOString();
const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

function initialState(): HomeListsState {
  const createdAt = now();
  const lists: HomeList[] = [
    { id: randomUUID(), name: 'Groceries', kind: 'shopping', color: COLORS[2], createdAt },
    { id: randomUUID(), name: 'Home', kind: 'todo', color: COLORS[0], createdAt },
    { id: randomUUID(), name: 'Personal', kind: 'todo', color: COLORS[3], createdAt },
  ];
  return { version: 1, lists, items: [], updatedAt: createdAt };
}

function demoState(): HomeListsState {
  const state = initialState();
  const [groceries, home, personal] = state.lists;
  const today = localDate();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDate(tomorrowDate);
  const completedAt = now();

  const item = (
    listId: string,
    title: string,
    fields: Partial<ListItem> = {},
  ): ListItem => ({
    id: randomUUID(), listId, title, completed: false, quantity: null, category: null,
    dueDate: null, priority: 'medium', notes: null, createdAt: now(), completedAt: null, ...fields,
  });

  state.items = [
    item(groceries.id, 'Oat milk', { quantity: '2', category: 'Dairy & chilled' }),
    item(groceries.id, 'Sourdough bread', { quantity: '1 loaf', category: 'Bakery' }),
    item(groceries.id, 'Cherry tomatoes', { quantity: '500 g', category: 'Produce' }),
    item(groceries.id, 'Avocados', { quantity: '3', category: 'Produce' }),
    item(groceries.id, 'Coffee beans', { quantity: '1 bag', category: 'Pantry' }),
    item(groceries.id, 'Dishwasher tablets', { quantity: '1 box', category: 'Household' }),
    item(home.id, 'Book annual boiler service', { dueDate: today, priority: 'high' }),
    item(home.id, 'Water the balcony herbs', { dueDate: today, priority: 'medium' }),
    item(home.id, 'Replace hallway light bulb', { dueDate: tomorrow, priority: 'low' }),
    item(personal.id, 'Pick up dry cleaning', { dueDate: tomorrow, priority: 'medium' }),
    item(personal.id, 'Order birthday gift', { dueDate: today, priority: 'high' }),
    item(home.id, 'Take recycling out', { completed: true, completedAt }),
    item(groceries.id, 'Free-range eggs', { completed: true, completedAt, quantity: '12', category: 'Dairy & chilled' }),
  ];
  state.updatedAt = now();
  return state;
}

function cleanText(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

export class HomeListsStore {
  private readonly file: string;
  private state: HomeListsState;

  constructor(dataDir: string) {
    this.file = join(dataDir, 'home-lists.json');
    mkdirSync(dirname(this.file), { recursive: true });
    this.state = this.load();
  }

  private load(): HomeListsState {
    if (!existsSync(this.file)) {
      const state = process.env.HOME_LISTS_DEMO === '1' ? demoState() : initialState();
      this.persist(state);
      return state;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as HomeListsState;
      if (!Array.isArray(parsed.lists) || !Array.isArray(parsed.items)) throw new Error('Invalid data');
      return parsed;
    } catch (error) {
      throw new Error(`Could not read ${this.file}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private persist(state = this.state) {
    state.updatedAt = now();
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(temp, this.file);
  }

  getState(): StateResponse {
    const today = localDate();
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const shoppingIds = new Set(this.state.lists.filter(list => list.kind === 'shopping').map(list => list.id));
    const open = this.state.items.filter(item => !item.completed);
    return {
      ...this.state,
      lists: [...this.state.lists],
      items: [...this.state.items],
      summary: {
        openShopping: open.filter(item => shoppingIds.has(item.listId)).length,
        dueToday: open.filter(item => item.dueDate === today).length,
        overdue: open.filter(item => item.dueDate && item.dueDate < today).length,
        completedThisWeek: this.state.items.filter(item => item.completedAt && new Date(item.completedAt) >= startOfWeek).length,
      },
    };
  }

  addList(input: { name?: unknown; kind?: unknown; color?: unknown }): HomeList {
    const name = cleanText(input.name, 60);
    const kind: ListKind = input.kind === 'shopping' ? 'shopping' : 'todo';
    if (!name) throw new Error('List name is required');
    const list: HomeList = {
      id: randomUUID(), name, kind,
      color: /^#[0-9a-f]{6}$/i.test(String(input.color)) ? String(input.color) : COLORS[this.state.lists.length % COLORS.length],
      createdAt: now(),
    };
    this.state.lists.push(list);
    this.persist();
    return list;
  }

  updateList(id: string, input: { name?: unknown; color?: unknown }): HomeList {
    const list = this.state.lists.find(entry => entry.id === id);
    if (!list) throw new Error('List not found');
    if (input.name !== undefined) {
      const name = cleanText(input.name, 60);
      if (!name) throw new Error('List name is required');
      list.name = name;
    }
    if (input.color !== undefined && /^#[0-9a-f]{6}$/i.test(String(input.color))) list.color = String(input.color);
    this.persist();
    return list;
  }

  deleteList(id: string) {
    if (!this.state.lists.some(list => list.id === id)) throw new Error('List not found');
    this.state.lists = this.state.lists.filter(list => list.id !== id);
    this.state.items = this.state.items.filter(item => item.listId !== id);
    this.persist();
  }

  addItem(input: Partial<ListItem>): ListItem {
    const list = this.state.lists.find(entry => entry.id === input.listId);
    const title = cleanText(input.title, 200);
    if (!list) throw new Error('Choose a valid list');
    if (!title) throw new Error('Item name is required');
    const priority: Priority = ['low', 'medium', 'high'].includes(String(input.priority)) ? input.priority as Priority : 'medium';
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate)) ? String(input.dueDate) : null;
    const item: ListItem = {
      id: randomUUID(), listId: list.id, title, completed: false,
      quantity: cleanText(input.quantity, 40) || null,
      category: cleanText(input.category, 60) || null,
      dueDate, priority,
      notes: cleanText(input.notes, 1000) || null,
      createdAt: now(), completedAt: null,
    };
    this.state.items.unshift(item);
    this.persist();
    return item;
  }

  updateItem(id: string, input: Partial<ListItem>): ListItem {
    const item = this.state.items.find(entry => entry.id === id);
    if (!item) throw new Error('Item not found');
    if (input.listId !== undefined) {
      if (!this.state.lists.some(list => list.id === input.listId)) throw new Error('Choose a valid list');
      item.listId = input.listId;
    }
    if (input.title !== undefined) {
      const title = cleanText(input.title, 200);
      if (!title) throw new Error('Item name is required');
      item.title = title;
    }
    if (input.quantity !== undefined) item.quantity = cleanText(input.quantity, 40) || null;
    if (input.category !== undefined) item.category = cleanText(input.category, 60) || null;
    if (input.notes !== undefined) item.notes = cleanText(input.notes, 1000) || null;
    if (input.dueDate !== undefined) item.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate)) ? String(input.dueDate) : null;
    if (input.priority !== undefined && ['low', 'medium', 'high'].includes(input.priority)) item.priority = input.priority;
    if (input.completed !== undefined) {
      item.completed = Boolean(input.completed);
      item.completedAt = item.completed ? now() : null;
    }
    this.persist();
    return item;
  }

  deleteItem(id: string) {
    const length = this.state.items.length;
    this.state.items = this.state.items.filter(item => item.id !== id);
    if (length === this.state.items.length) throw new Error('Item not found');
    this.persist();
  }

  clearCompleted(listIds?: string[]) {
    const allowed = listIds ? new Set(listIds) : null;
    const before = this.state.items.length;
    this.state.items = this.state.items.filter(item => !item.completed || (allowed !== null && !allowed.has(item.listId)));
    this.persist();
    return before - this.state.items.length;
  }
}
