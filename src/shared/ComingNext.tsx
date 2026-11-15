// Placeholder for screens that arrive in a later phase (see README → Roadmap).
import { Screen } from './ui';

export function ComingNext({ title, eyebrow, phase, what }: { title: string; eyebrow: string; phase: string; what: string }) {
  return (
    <Screen header={<><p className="eyebrow">{eyebrow}</p><h1 className="display h1">{title}</h1></>}>
      <section className="glass card">
        <p className="label">Coming in {phase}</p>
        <p style={{ margin: 0 }}>{what}</p>
      </section>
    </Screen>
  );
}
