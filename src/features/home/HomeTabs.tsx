import { Link, useLocation } from 'react-router';

/** The Tasks | Inventory switch at the top of the Home tab. */
export function HomeTabs() {
  const { pathname } = useLocation();
  const inv = pathname.startsWith('/home/inventory');
  return (
    <div className="seg glass" role="tablist" aria-label="Home">
      <Link to="/home/tasks" role="tab" aria-selected={!inv} className={!inv ? 'on' : ''} replace>Tasks</Link>
      <Link to="/home/inventory" role="tab" aria-selected={inv} className={inv ? 'on' : ''} replace>Inventory</Link>
    </div>
  );
}
