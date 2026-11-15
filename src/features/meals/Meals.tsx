import { Link } from 'react-router';
import { Screen } from '../../shared/ui';

// The weekly menu (swipeable day cards) is next in Phase 3, after Checkpoint B.
export function MealsWeek() {
  return (
    <Screen
      header={
        <>
          <div className="header-row">
            <p className="eyebrow">Meals</p>
            <Link to="/recipes" className="btn btn-ghost btn-sm">Our Cookbook</Link>
          </div>
          <h1 className="display h1">Our menu</h1>
        </>
      }
    >
      <section className="glass card">
        <p className="label">Start with your recipes</p>
        <p style={{ margin: 0 }}>Add a few family recipes to Our Cookbook first. The weekly menu, portion scaler and meal prep labels build on them and arrive next.</p>
        <div className="chips">
          <Link to="/recipes/new" className="btn btn-primary btn-sm">+ New recipe</Link>
          <Link to="/recipes" className="btn btn-ghost btn-sm">Open Our Cookbook</Link>
        </div>
      </section>
    </Screen>
  );
}
