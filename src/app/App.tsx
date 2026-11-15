import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, type Location } from 'react-router';
import { pb, refreshAuth } from '../lib/pb';
import { startSync, stopSync } from '../lib/sync';
import { resetLocal } from '../lib/sync/db';
import { IconCalendar, IconHome, IconLists, IconMeals, IconToday } from '../shared/Icons';
import { ToastProvider } from '../shared/ui';
import { applyUpdate, onUpdateReady } from './update';
import { Login } from '../features/auth/Login';
import { Today } from '../features/today/Today';
import { CalendarWeek, CalendarMonth } from '../features/calendar/Calendar';
import { EventEditor } from '../features/calendar/EventEditor';
import { ListsScreen } from '../features/lists/Lists';
import { ManageLists } from '../features/lists/ManageLists';
import { ShoppingTrip } from '../features/lists/ShoppingTrip';
import { MealsWeek } from '../features/meals/Meals';
import { Cookbook } from '../features/recipes/Cookbook';
import { RecipeView } from '../features/recipes/RecipeView';
import { RecipeEditor } from '../features/recipes/RecipeEditor';
import { CookMode } from '../features/recipes/CookMode';
import { PrepLabels } from '../features/recipes/PrepLabels';
import { TasksScreen } from '../features/tasks/Tasks';
import { TaskEditor } from '../features/tasks/TaskEditor';
import { InventoryScreen } from '../features/inventory/Inventory';
import { QuickAdd } from '../features/quickadd/QuickAdd';
import { Settings } from '../features/settings/Settings';
import { ImportScreen } from '../features/settings/Import';

function useSignedIn() {
  // A stored session counts even offline, so the app opens in the store with no signal.
  const has = () => !!pb.authStore.token && !!pb.authStore.record;
  const [signedIn, setSignedIn] = useState(has);
  useEffect(() => pb.authStore.onChange(() => setSignedIn(has())), []);
  return signedIn;
}

export function App() {
  const signedIn = useSignedIn();
  const location = useLocation();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  useEffect(() => {
    if (!signedIn) return;
    void refreshAuth().then(() => startSync());
    return () => {
      void stopSync();
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="app">
        <Login onSignedOut={() => resetLocal()} />
      </div>
    );
  }

  // Quick add opens as a sheet over whatever screen you were on.
  const bg = (location.state as { bg?: Location } | null)?.bg;
  const showNav = !/^\/(recipes\/[^/]+\/(cook|labels)|lists\/[^/]+\/trip)/.test((bg || location).pathname);

  return (
    <ToastProvider>
      <div className="app">
        <Routes location={bg || location}>
          <Route path="/" element={<Today />} />
          <Route path="/calendar" element={<CalendarWeek />} />
          <Route path="/calendar/month" element={<CalendarMonth />} />
          <Route path="/calendar/new" element={<EventEditor />} />
          <Route path="/calendar/event/:id" element={<EventEditor />} />
          <Route path="/lists" element={<ListsScreen />} />
          <Route path="/lists/manage" element={<ManageLists />} />
          <Route path="/lists/:listId" element={<ListsScreen />} />
          <Route path="/lists/:listId/trip" element={<ShoppingTrip />} />
          <Route path="/meals" element={<MealsWeek />} />
          <Route path="/recipes" element={<Cookbook />} />
          <Route path="/recipes/new" element={<RecipeEditor />} />
          <Route path="/recipes/:id" element={<RecipeView />} />
          <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
          <Route path="/recipes/:id/cook" element={<CookMode />} />
          <Route path="/recipes/:id/labels" element={<PrepLabels />} />
          <Route path="/home" element={<Navigate to="/home/tasks" replace />} />
          <Route path="/home/tasks" element={<TasksScreen />} />
          <Route path="/home/inventory" element={<InventoryScreen />} />
          <Route path="/tasks/new" element={<TaskEditor />} />
          <Route path="/tasks/:id" element={<TaskEditor />} />
          <Route path="/add" element={<><Today /><QuickAdd /></>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/import" element={<ImportScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {bg && (
          <Routes>
            <Route path="/add" element={<QuickAdd />} />
          </Routes>
        )}
        {showNav && <BottomNav />}
        {updateReady && (
          <div className="toast" role="status">
            <span className="grow">A new version of Family Hub is ready.</span>
            <button type="button" onClick={applyUpdate}>Reload</button>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const is = (re: RegExp) => re.test(pathname);
  const items = [
    { to: '/', label: 'Today', icon: <IconToday />, active: pathname === '/' || pathname === '/add' },
    { to: '/calendar', label: 'Calendar', icon: <IconCalendar />, active: is(/^\/calendar/) },
    { to: '/lists', label: 'Lists', icon: <IconLists />, active: is(/^\/lists/) },
    { to: '/meals', label: 'Meals', icon: <IconMeals />, active: is(/^\/(meals|recipes)/) },
    { to: '/home/tasks', label: 'Home', icon: <IconHome />, active: is(/^\/(home|tasks)/) },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={i.active ? 'active' : ''} aria-current={i.active ? 'page' : undefined} end>
          {i.icon}
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
