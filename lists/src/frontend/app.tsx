import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HomeList, ListItem, ListKind, Priority, StateResponse } from '../shared/types';
import { api } from './api';
import './custom.css';

type View = 'today' | 'shopping' | 'todo' | string;
type IconName = 'home' | 'cart' | 'check' | 'list' | 'plus' | 'search' | 'calendar' | 'sparkle' | 'clock' | 'trash' | 'x' | 'chevron' | 'more' | 'bag' | 'inbox' | 'alert' | 'leaf';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    check: <><path d="m5 12 4 4L19 6"/><path d="M21 12a9 9 0 1 1-5.3-8.2"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    sparkle: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6L19 13Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    x: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    bag: <><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></>,
    inbox: <><path d="M4 5h16l2 9v5H2v-5l2-9Z"/><path d="M2 14h5l2 3h6l2-3h5"/></>,
    alert: <><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.5 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 4.5a2 2 0 0 0-3.4 0Z"/></>,
    leaf: <><path d="M20 4c-8 0-14 4-14 10 0 3 2 5 5 5 6 0 9-7 9-15Z"/><path d="M4 21c2-5 6-8 11-11"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

const todayKey = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(value: string | null, short = false) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, short ? { month: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function dueLabel(value: string | null) {
  if (!value) return '';
  const today = todayKey();
  if (value === today) return 'Today';
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  if (value === tomorrowKey) return 'Tomorrow';
  if (value < today) return `Overdue · ${formatDate(value, true)}`;
  return formatDate(value, true);
}

function Spinner() { return <div className="spinner" aria-label="Loading" />; }

function Sidebar({ state, view, onView, onAddList }: { state: StateResponse; view: View; onView: (view: View) => void; onAddList: () => void }) {
  const listCount = (id: string) => state.items.filter(item => item.listId === id && !item.completed).length;
  return <aside className="sidebar">
    <button className="brand" onClick={() => onView('today')}>
      <span className="brand-mark"><Icon name="leaf" size={22} /></span>
      <span><strong>Home Lists</strong><small>Make space for living</small></span>
    </button>
    <nav className="primary-nav" aria-label="Main navigation">
      <NavButton active={view === 'today'} icon="home" label="Today" badge={state.summary.dueToday + state.summary.overdue} onClick={() => onView('today')} />
      <NavButton active={view === 'shopping'} icon="cart" label="Shopping" badge={state.summary.openShopping} onClick={() => onView('shopping')} />
      <NavButton active={view === 'todo'} icon="check" label="To-dos" badge={state.items.filter(item => !item.completed && state.lists.find(list => list.id === item.listId)?.kind === 'todo').length} onClick={() => onView('todo')} />
    </nav>
    <div className="nav-section-head"><span>My lists</span><button className="icon-button small" title="Add list" onClick={onAddList}><Icon name="plus" size={16}/></button></div>
    <nav className="list-nav" aria-label="My lists">
      {state.lists.map(list => <button key={list.id} className={`list-nav-item ${view === list.id ? 'active' : ''}`} onClick={() => onView(list.id)}>
        <span className="list-dot" style={{ background: list.color }} />
        <span>{list.name}</span><small>{listCount(list.id)}</small>
      </button>)}
    </nav>
    <div className="sidebar-tip"><Icon name="sparkle" size={18}/><div><strong>Small steps count</strong><span>{state.summary.completedThisWeek} items finished this week</span></div></div>
  </aside>;
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: IconName; label: string; badge: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><Icon name={icon}/><span>{label}</span>{badge > 0 && <small>{badge}</small>}</button>;
}

function MobileNav({ view, onView, onAdd }: { view: View; onView: (view: View) => void; onAdd: () => void }) {
  return <nav className="mobile-nav">
    <button className={view === 'today' ? 'active' : ''} onClick={() => onView('today')}><Icon name="home"/><span>Today</span></button>
    <button className={view === 'shopping' ? 'active' : ''} onClick={() => onView('shopping')}><Icon name="cart"/><span>Shopping</span></button>
    <button className="mobile-add" onClick={onAdd} aria-label="Add item"><Icon name="plus" size={25}/></button>
    <button className={view === 'todo' ? 'active' : ''} onClick={() => onView('todo')}><Icon name="check"/><span>To-dos</span></button>
    <button className={typeof view === 'string' && !['today','shopping','todo'].includes(view) ? 'active' : ''} onClick={() => onView('lists')}><Icon name="list"/><span>Lists</span></button>
  </nav>;
}

function Topbar({ title, subtitle, onAdd, onSearch, searchOpen }: { title: string; subtitle: string; onAdd: () => void; onSearch: () => void; searchOpen: boolean }) {
  return <header className="topbar">
    <div><p>{subtitle}</p><h1>{title}</h1></div>
    <div className="topbar-actions">
      <button className={`icon-button ${searchOpen ? 'active' : ''}`} onClick={onSearch} aria-label="Search"><Icon name="search"/></button>
      <button className="primary-button" onClick={onAdd} aria-label="Add item"><Icon name="plus" size={18}/><span>Add item</span></button>
    </div>
  </header>;
}

function QuickAdd({ lists, preferred, onCreate }: { lists: HomeList[]; preferred?: ListKind; onCreate: (item: Partial<ListItem>) => Promise<void> }) {
  const available = lists.filter(list => !preferred || list.kind === preferred);
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState(available[0]?.id || lists[0]?.id || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lists.some(list => list.id === listId) || (preferred && !available.some(list => list.id === listId))) setListId(available[0]?.id || lists[0]?.id || '');
  }, [preferred, lists.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !listId) return;
    setSaving(true);
    try { await onCreate({ title, listId }); setTitle(''); }
    finally { setSaving(false); }
  };

  return <form className="quick-add" onSubmit={submit}>
    <span className="quick-add-plus"><Icon name="plus" size={20}/></span>
    <input value={title} onChange={event => setTitle(event.target.value)} placeholder={preferred === 'shopping' ? 'Add milk, bread, apples…' : preferred === 'todo' ? 'What needs to be done?' : 'Add something to your lists…'} aria-label="Item name" />
    <select value={listId} onChange={event => setListId(event.target.value)} aria-label="Choose list">
      {(available.length ? available : lists).map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
    </select>
    <button disabled={!title.trim() || saving} aria-label="Add item">{saving ? <Spinner/> : <Icon name="chevron" size={18}/>}</button>
  </form>;
}

function StatCard({ icon, tone, value, label, detail }: { icon: IconName; tone: string; value: number; label: string; detail: string }) {
  return <div className={`stat-card ${tone}`}><span className="stat-icon"><Icon name={icon}/></span><div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></div>;
}

function TodayView({ state, onCreate, onToggle, onEdit, onView }: ViewProps & { onView: (view: View) => void }) {
  const today = todayKey();
  const dueItems = state.items.filter(item => !item.completed && item.dueDate && item.dueDate <= today).sort((a,b) => (a.dueDate || '').localeCompare(b.dueDate || '') || priorityOrder(b.priority) - priorityOrder(a.priority));
  const shopping = state.items.filter(item => !item.completed && state.lists.find(list => list.id === item.listId)?.kind === 'shopping').slice(0, 5);
  const completed = state.items.filter(item => item.completed).sort((a,b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 4);
  const completionTotal = state.items.filter(item => item.completedAt && new Date(item.completedAt) >= new Date(Date.now() - 7 * 86400000)).length;
  const weeklyGoal = Math.max(12, completionTotal);

  return <>
    <section className="hero-row">
      <div><span className="eyebrow"><Icon name="sparkle" size={15}/> Your day at a glance</span><h2>{greeting()},<br/><em>you’ve got this.</em></h2><p>One calm place for everything your home needs today.</p></div>
      <div className="week-progress"><div className="progress-ring" style={{ '--progress': `${Math.min(100, completionTotal / weeklyGoal * 100)}%` } as React.CSSProperties}><span>{completionTotal}</span><small>done</small></div><div><strong>A good week</strong><span>Every checked item<br/>makes the load lighter.</span></div></div>
    </section>
    <QuickAdd lists={state.lists} onCreate={onCreate}/>
    <section className="stats-grid">
      <StatCard icon="cart" tone="green" value={state.summary.openShopping} label="To pick up" detail="Across shopping lists"/>
      <StatCard icon="calendar" tone="coral" value={state.summary.dueToday} label="Due today" detail={state.summary.overdue ? `${state.summary.overdue} overdue` : 'Nothing overdue'}/>
      <StatCard icon="check" tone="blue" value={state.summary.completedThisWeek} label="Completed" detail="In the last 7 days"/>
    </section>
    <section className="dashboard-grid">
      <Panel title="Today’s focus" icon="clock" action={dueItems.length ? `${dueItems.length} items` : undefined}>
        {dueItems.length ? <div className="compact-list">{dueItems.slice(0,5).map(item => <ItemRow key={item.id} item={item} list={findList(state, item.listId)} onToggle={onToggle} onEdit={onEdit} compact/>)}</div> : <EmptyState icon="check" title="Today is clear" text="No tasks are due. Enjoy the breathing room."/>}
      </Panel>
      <Panel title="Shopping next" icon="bag" action={shopping.length ? 'View list' : undefined} onAction={() => onView('shopping')}>
        {shopping.length ? <div className="shopping-preview">{shopping.map(item => <button key={item.id} onClick={() => onEdit(item)}><span className="preview-dot" style={{ background: findList(state,item.listId)?.color }}/><strong>{item.title}</strong>{item.quantity && <small>{item.quantity}</small>}</button>)}</div> : <EmptyState icon="cart" title="Basket is empty" text="Add what you need before the next shop."/>}
      </Panel>
    </section>
    {completed.length > 0 && <section className="recent-strip"><div><Icon name="sparkle" size={18}/><span><strong>Recently finished</strong> Nice work keeping things moving.</span></div><div className="recent-items">{completed.map(item => <button key={item.id} onClick={() => onToggle(item)}><Icon name="check" size={14}/>{item.title}</button>)}</div></section>}
  </>;
}

interface ViewProps {
  state: StateResponse;
  onCreate: (item: Partial<ListItem>) => Promise<void>;
  onToggle: (item: ListItem) => Promise<void>;
  onEdit: (item: ListItem) => void;
}

function ShoppingView({ state, onCreate, onToggle, onEdit, scopedList, search, onClear }: ViewProps & { scopedList?: HomeList; search: string; onClear: (ids: string[]) => void }) {
  const lists = scopedList ? [scopedList] : state.lists.filter(list => list.kind === 'shopping');
  const listIds = new Set(lists.map(list => list.id));
  const items = state.items.filter(item => listIds.has(item.listId) && item.title.toLowerCase().includes(search.toLowerCase()));
  const open = items.filter(item => !item.completed);
  const completed = items.filter(item => item.completed);
  const groups = useMemo(() => groupBy(open, item => item.category || 'Other'), [items]);

  return <>
    <QuickAdd lists={lists.length ? lists : state.lists} preferred="shopping" onCreate={onCreate}/>
    {!lists.length ? <EmptyState icon="cart" title="Create your first shopping list" text="Keep groceries, errands, and household supplies in one place."/> : <>
      <div className="view-summary"><div className="summary-illustration"><Icon name="bag" size={30}/></div><div><strong>{open.length} {open.length === 1 ? 'item' : 'items'} left</strong><span>{completed.length ? `${completed.length} already in the basket` : 'Ready for your next shop'}</span></div><div className="mini-progress"><span style={{ width: `${items.length ? completed.length / items.length * 100 : 0}%` }}/></div></div>
      <div className="category-grid">{Object.entries(groups).map(([category, entries]) => <section className="category-card" key={category}>
        <header><div><span className="category-icon">{categoryEmoji(category)}</span><div><h3>{category}</h3><small>{entries.length} {entries.length === 1 ? 'item' : 'items'}</small></div></div></header>
        <div>{entries.map(item => <ItemRow key={item.id} item={item} list={findList(state,item.listId)} onToggle={onToggle} onEdit={onEdit}/>)}</div>
      </section>)}</div>
      {!open.length && <EmptyState icon="check" title={search ? 'No matching items' : 'Everything is checked off'} text={search ? 'Try a different search.' : 'Your shopping list is ready for a fresh start.'}/>}
      {completed.length > 0 && <CompletedSection items={completed} state={state} onToggle={onToggle} onEdit={onEdit} onClear={() => { if (confirm(`Permanently clear ${completed.length} completed ${completed.length === 1 ? 'item' : 'items'}?`)) onClear([...listIds]); }}/>}
    </>}
  </>;
}

function TodoView({ state, onCreate, onToggle, onEdit, scopedList, search, onClear }: ViewProps & { scopedList?: HomeList; search: string; onClear: (ids: string[]) => void }) {
  const lists = scopedList ? [scopedList] : state.lists.filter(list => list.kind === 'todo');
  const listIds = new Set(lists.map(list => list.id));
  const items = state.items.filter(item => listIds.has(item.listId) && item.title.toLowerCase().includes(search.toLowerCase()));
  const open = items.filter(item => !item.completed).sort((a,b) => dueSort(a,b));
  const completed = items.filter(item => item.completed);
  const today = todayKey();
  const sections: [string, ListItem[]][] = [
    ['Overdue', open.filter(item => item.dueDate && item.dueDate < today)],
    ['Today', open.filter(item => item.dueDate === today)],
    ['Upcoming', open.filter(item => item.dueDate && item.dueDate > today)],
    ['Anytime', open.filter(item => !item.dueDate)],
  ].filter(([, entries]) => entries.length) as [string, ListItem[]][];

  return <>
    <QuickAdd lists={lists.length ? lists : state.lists} preferred="todo" onCreate={onCreate}/>
    {!lists.length ? <EmptyState icon="check" title="Create your first to-do list" text="Give everyday tasks a simple home."/> : <div className="todo-layout">
      <div className="todo-main">
        {sections.map(([title, entries]) => <section className={`todo-section ${title === 'Overdue' ? 'overdue' : ''}`} key={title}>
          <header><h3>{title}</h3><span>{entries.length}</span></header>
          <div className="todo-card">{entries.map(item => <ItemRow key={item.id} item={item} list={findList(state,item.listId)} onToggle={onToggle} onEdit={onEdit}/>)}</div>
        </section>)}
        {!open.length && <EmptyState icon="check" title={search ? 'No matching tasks' : 'All caught up'} text={search ? 'Try a different search.' : 'Your open tasks will appear here.'}/>}
        {completed.length > 0 && <CompletedSection items={completed} state={state} onToggle={onToggle} onEdit={onEdit} onClear={() => { if (confirm(`Permanently clear ${completed.length} completed ${completed.length === 1 ? 'item' : 'items'}?`)) onClear([...listIds]); }}/>}
      </div>
      <aside className="list-overview"><h3>Open by list</h3>{lists.map(list => {
        const count = open.filter(item => item.listId === list.id).length;
        const total = items.filter(item => item.listId === list.id).length;
        return <div key={list.id}><span className="list-dot" style={{ background: list.color }}/><strong>{list.name}</strong><small>{count} open</small><div><span style={{ width: `${total ? (total-count)/total*100 : 0}%`, background: list.color }}/></div></div>;
      })}</aside>
    </div>}
  </>;
}

function ItemRow({ item, list, onToggle, onEdit, compact = false }: { item: ListItem; list?: HomeList; onToggle: (item: ListItem) => void; onEdit: (item: ListItem) => void; compact?: boolean }) {
  return <div className={`item-row ${item.completed ? 'completed' : ''} ${compact ? 'compact' : ''}`}>
    <button className="check-button" style={{ '--item-color': list?.color || '#4d9c7d' } as React.CSSProperties} onClick={() => onToggle(item)} aria-label={item.completed ? 'Restore item' : 'Complete item'}><Icon name="check" size={14}/></button>
    <button className="item-content" onClick={() => onEdit(item)}>
      <strong>{item.title}</strong>
      <span>{item.quantity && <small className="quantity">{item.quantity}</small>}{item.dueDate && <small className={item.dueDate < todayKey() && !item.completed ? 'late' : ''}><Icon name="calendar" size={12}/>{dueLabel(item.dueDate)}</small>}{list && <small><span className="tiny-dot" style={{ background: list.color }}/>{list.name}</small>}{item.priority === 'high' && <small className="priority-high">High priority</small>}</span>
    </button>
    <button className="row-more" onClick={() => onEdit(item)} aria-label="Edit item"><Icon name="more" size={18}/></button>
  </div>;
}

function CompletedSection({ items, state, onToggle, onEdit, onClear }: { items: ListItem[]; state: StateResponse; onToggle: (item: ListItem) => void; onEdit: (item: ListItem) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  return <section className={`completed-section ${open ? 'open' : ''}`}>
    <header><button onClick={() => setOpen(value => !value)}><Icon name="chevron" size={16}/><strong>Completed</strong><span>{items.length}</span></button><button className="text-button danger" onClick={onClear}>Clear</button></header>
    {open && <div className="todo-card">{items.map(item => <ItemRow key={item.id} item={item} list={findList(state,item.listId)} onToggle={onToggle} onEdit={onEdit}/>)}</div>}
  </section>;
}

function Panel({ title, icon, action, onAction, children }: { title: string; icon: IconName; action?: string; onAction?: () => void; children: ReactNode }) {
  return <section className="panel"><header><div><span><Icon name={icon} size={18}/></span><h3>{title}</h3></div>{action && <button onClick={onAction}>{action}<Icon name="chevron" size={14}/></button>}</header>{children}</section>;
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="empty-state"><span><Icon name={icon} size={24}/></span><strong>{title}</strong><p>{text}</p></div>;
}

function SearchBar({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return <div className="search-bar"><Icon name="search"/><input ref={ref} value={value} onChange={event => onChange(event.target.value)} placeholder="Search this view…"/><button onClick={onClose}><Icon name="x" size={18}/></button></div>;
}

function ItemModal({ state, initialListId, kind, item, onClose, onSave, onDelete }: { state: StateResponse; initialListId?: string; kind?: ListKind; item?: ListItem; onClose: () => void; onSave: (data: Partial<ListItem>) => Promise<void>; onDelete: (item: ListItem) => Promise<void> }) {
  const initialList = state.lists.find(list => list.id === (item?.listId || initialListId)) || state.lists.find(list => !kind || list.kind === kind) || state.lists[0];
  const [listId, setListId] = useState(initialList?.id || '');
  const [title, setTitle] = useState(item?.title || '');
  const [quantity, setQuantity] = useState(item?.quantity || '');
  const [category, setCategory] = useState(item?.category || '');
  const [dueDate, setDueDate] = useState(item?.dueDate || '');
  const [priority, setPriority] = useState<Priority>(item?.priority || 'medium');
  const [notes, setNotes] = useState(item?.notes || '');
  const [saving, setSaving] = useState(false);
  const selectedList = state.lists.find(list => list.id === listId);
  const isShopping = selectedList?.kind === 'shopping';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !listId) return;
    setSaving(true);
    try { await onSave({ listId, title, quantity, category, dueDate, priority, notes }); onClose(); }
    finally { setSaving(false); }
  };

  return <Modal onClose={onClose}>
    <form className="editor" onSubmit={submit}>
      <header><div><span className="editor-icon"><Icon name={isShopping ? 'cart' : 'check'}/></span><div><p>{item ? 'Edit item' : 'New item'}</p><h2>{isShopping ? 'Add to shopping' : 'Add a to-do'}</h2></div></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="x"/></button></header>
      <label className="field"><span>What do you need?</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder={isShopping ? 'e.g. Fresh basil' : 'e.g. Call the plumber'} maxLength={200}/></label>
      <label className="field"><span>List</span><select value={listId} onChange={event => setListId(event.target.value)}>{state.lists.map(list => <option key={list.id} value={list.id}>{list.name} · {list.kind === 'shopping' ? 'Shopping' : 'To-do'}</option>)}</select></label>
      {isShopping ? <div className="field-row"><label className="field"><span>Quantity</span><input value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="e.g. 2 packs"/></label><label className="field"><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Other</option>{['Produce','Bakery','Dairy & chilled','Meat & fish','Pantry','Drinks','Household','Personal care'].map(value => <option key={value}>{value}</option>)}</select></label></div> : <><div className="field-row"><label className="field"><span>Due date</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)}/></label><label className="field"><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div></>}
      <label className="field"><span>Notes <small>optional</small></span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add a helpful detail…" rows={3}/></label>
      <footer>{item ? <button type="button" className="delete-button" onClick={() => onDelete(item)}><Icon name="trash" size={17}/>Delete</button> : <span/>}<button className="save-button" disabled={!title.trim() || saving}>{saving ? <Spinner/> : <><Icon name="plus" size={18}/>{item ? 'Save changes' : 'Add item'}</>}</button></footer>
    </form>
  </Modal>;
}

function ListModal({ onClose, onSave }: { onClose: () => void; onSave: (data: Partial<HomeList>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('shopping');
  const [color, setColor] = useState('#4d9c7d');
  const colors = ['#f27d52','#dfad42','#4d9c7d','#5888c7','#8a6bc1','#d36988'];
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; await onSave({ name, kind, color }); onClose(); };
  return <Modal onClose={onClose}><form className="editor list-editor" onSubmit={submit}><header><div><span className="editor-icon"><Icon name="list"/></span><div><p>Organize your home</p><h2>Create a list</h2></div></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="x"/></button></header><label className="field"><span>List name</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Weekend errands"/></label><div className="kind-picker"><button type="button" className={kind === 'shopping' ? 'active' : ''} onClick={() => setKind('shopping')}><Icon name="cart"/><span><strong>Shopping</strong><small>Things to buy</small></span></button><button type="button" className={kind === 'todo' ? 'active' : ''} onClick={() => setKind('todo')}><Icon name="check"/><span><strong>To-do</strong><small>Things to finish</small></span></button></div><label className="field"><span>Color</span><div className="color-picker">{colors.map(value => <button key={value} type="button" className={color === value ? 'active' : ''} style={{ background: value }} onClick={() => setColor(value)} aria-label={`Choose ${value}`}/>)}</div></label><footer><span/><button className="save-button" disabled={!name.trim()}><Icon name="plus" size={18}/>Create list</button></footer></form></Modal>;
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => { const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => event.currentTarget === event.target && onClose()}><div className="modal-card">{children}</div></div>;
}

function ListsMobileView({ state, onView, onAddList }: { state: StateResponse; onView: (view: View) => void; onAddList: () => void }) {
  return <div className="all-lists"><button className="create-list-card" onClick={onAddList}><Icon name="plus"/><span>Create a new list</span></button>{state.lists.map(list => <button className="all-list-card" key={list.id} onClick={() => onView(list.id)}><span style={{ background: list.color }}><Icon name={list.kind === 'shopping' ? 'cart' : 'check'}/></span><div><strong>{list.name}</strong><small>{state.items.filter(item => item.listId === list.id && !item.completed).length} open items</small></div><Icon name="chevron" size={18}/></button>)}</div>;
}

function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [view, setView] = useState<View>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [itemModal, setItemModal] = useState<{ item?: ListItem; listId?: string; kind?: ListKind } | null>(null);
  const [listModal, setListModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    try { setState(await api.state()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your lists'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2500); };
  const mutate = async (action: () => Promise<unknown>, message?: string) => {
    try { await action(); await load(); if (message) notify(message); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Something went wrong'); throw cause; }
  };

  if (loading) return <main className="loading-screen"><span className="brand-mark"><Icon name="leaf" size={28}/></span><Spinner/><p>Opening your lists…</p></main>;
  if (!state || error) return <main className="error-screen"><Icon name="alert" size={32}/><h1>We couldn’t open Home Lists</h1><p>{error}</p><button className="primary-button" onClick={() => { setLoading(true); load(); }}>Try again</button></main>;

  const scopedList = state.lists.find(list => list.id === view);
  const effectiveView = scopedList?.kind || view;
  const title = view === 'today' ? 'Today' : view === 'shopping' ? 'Shopping' : view === 'todo' ? 'To-dos' : view === 'lists' ? 'My lists' : scopedList?.name || 'Today';
  const subtitle = scopedList ? (scopedList.kind === 'shopping' ? 'Shopping list' : 'To-do list') : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const preferredKind = effectiveView === 'shopping' || effectiveView === 'todo' ? effectiveView as ListKind : undefined;

  const onCreate = (item: Partial<ListItem>) => mutate(() => api.addItem(item), 'Item added');
  const onToggle = (item: ListItem) => mutate(() => api.updateItem(item.id, { completed: !item.completed }), item.completed ? 'Item restored' : 'Nice work — item complete');
  const onDelete = async (item: ListItem) => { await mutate(() => api.deleteItem(item.id), 'Item deleted'); setItemModal(null); };
  const openAdd = () => setItemModal({ listId: scopedList?.id, kind: preferredKind });
  const onView = (next: View) => { setView(next); setSearch(''); setSearchOpen(false); };

  return <div className="app-shell">
    <Sidebar state={state} view={view} onView={onView} onAddList={() => setListModal(true)}/>
    <main className="main-content">
      <Topbar title={title} subtitle={subtitle} onAdd={openAdd} searchOpen={searchOpen} onSearch={() => setSearchOpen(value => !value)}/>
      {searchOpen && <SearchBar value={search} onChange={setSearch} onClose={() => { setSearchOpen(false); setSearch(''); }}/>}
      <div className="page-content">
        {view === 'today' && <TodayView state={state} onCreate={onCreate} onToggle={onToggle} onEdit={item => setItemModal({ item })} onView={onView}/>}
        {effectiveView === 'shopping' && <ShoppingView state={state} scopedList={scopedList} search={search} onCreate={onCreate} onToggle={onToggle} onEdit={item => setItemModal({ item })} onClear={ids => mutate(() => api.clearCompleted(ids), 'Completed items cleared')}/>}
        {effectiveView === 'todo' && <TodoView state={state} scopedList={scopedList} search={search} onCreate={onCreate} onToggle={onToggle} onEdit={item => setItemModal({ item })} onClear={ids => mutate(() => api.clearCompleted(ids), 'Completed items cleared')}/>}
        {view === 'lists' && <ListsMobileView state={state} onView={onView} onAddList={() => setListModal(true)}/>}
        {scopedList && <div className="list-settings"><span>List settings</span><button onClick={() => { if (confirm(`Delete “${scopedList.name}” and all its items?`)) mutate(() => api.deleteList(scopedList.id), 'List deleted').then(() => onView('today')); }}><Icon name="trash" size={15}/>Delete list</button></div>}
      </div>
    </main>
    <MobileNav view={view} onView={onView} onAdd={openAdd}/>
    {itemModal && <ItemModal state={state} {...itemModal} onClose={() => setItemModal(null)} onSave={data => itemModal.item ? mutate(() => api.updateItem(itemModal.item!.id, data), 'Changes saved') : onCreate(data)} onDelete={async item => { if (confirm(`Delete “${item.title}”?`)) await onDelete(item); }}/>}
    {listModal && <ListModal onClose={() => setListModal(false)} onSave={data => mutate(() => api.addList(data), 'List created')}/>}
    {toast && <div className="toast"><Icon name="check" size={17}/>{toast}</div>}
  </div>;
}

function findList(state: StateResponse, id: string) { return state.lists.find(list => list.id === id); }
function priorityOrder(priority: Priority) { return priority === 'high' ? 3 : priority === 'medium' ? 2 : 1; }
function dueSort(a: ListItem, b: ListItem) { if (!a.dueDate && b.dueDate) return 1; if (a.dueDate && !b.dueDate) return -1; return (a.dueDate || '').localeCompare(b.dueDate || '') || priorityOrder(b.priority)-priorityOrder(a.priority); }
function groupBy<T>(values: T[], key: (value: T) => string) { return values.reduce<Record<string,T[]>>((groups,value) => { const name = key(value); (groups[name] ||= []).push(value); return groups; }, {}); }
function categoryEmoji(category: string) { const value = category.toLowerCase(); if (value.includes('produce')) return '🥬'; if (value.includes('bakery')) return '🥖'; if (value.includes('dairy')) return '🥛'; if (value.includes('meat') || value.includes('fish')) return '🥩'; if (value.includes('drink')) return '🫗'; if (value.includes('house')) return '🧽'; if (value.includes('care')) return '🧴'; if (value.includes('pantry')) return '🫙'; return '🛍️'; }

createRoot(document.getElementById('app')!).render(<App/>);
