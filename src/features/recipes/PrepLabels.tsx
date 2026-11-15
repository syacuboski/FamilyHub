// Meal prep labels (mockup: Meal prep labels · night). Preview, label size,
// use-by days, macros and reheat note, then print through the phone's print
// menu. Optionally puts the prepped portions into Freezer inventory.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { add, patch, useRecord, useRecords } from '../../lib/sync';
import { addDays, MON_SHORT, today, ymd } from '../../lib/dates';
import { caloriesFrom, fmtQty } from '../../lib/scale';
import { planFromParams } from '../../lib/headcount';
import { BackLink, Loading, Stepper, useToast } from '../../shared/ui';
import { IconPrint } from '../../shared/Icons';
import type { InventoryRec } from '../../lib/types';
import './recipes.css';
import './print.css';

type Size = '4x2' | '3x2' | '5160';
const SIZES: { id: Size; label: string; name: string; page: string }[] = [
  { id: '4x2', label: '4 × 2 in', name: '4 × 2 in shipping label (label printer)', page: '4in 2in' },
  { id: '3x2', label: '3 × 2 in', name: '3 × 2 in label (label printer)', page: '3in 2in' },
  { id: '5160', label: 'Address sheet', name: 'Avery 5160-style sheet, 30 per letter page', page: 'letter' },
];
const PREF = 'fh.labels';

export function PrepLabels() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const r = useRecord('recipes', id);
  const inventory = useRecords('inventory');
  const toast = useToast();
  const plan = planFromParams(params);
  const pref = (() => {
    try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; }
  })();
  const [size, setSize] = useState<Size>(pref.size || '4x2');
  const [days, setDays] = useState<number>(pref.days || 4);
  const [macros, setMacros] = useState<boolean>(pref.macros ?? true);
  const [reheat, setReheat] = useState<boolean>(pref.reheat ?? true);
  const [kidPreview, setKidPreview] = useState(false);
  const [adultCount, setAdultCount] = useState(plan.prepA || 4);
  const [kidCount, setKidCount] = useState(plan.prepK || 0);
  const [toFreezer, setToFreezer] = useState(true);

  useEffect(() => {
    try { localStorage.setItem(PREF, JSON.stringify({ size, days, macros, reheat })); } catch { /* ignore */ }
  }, [size, days, macros, reheat]);

  if (r === undefined) return <Loading />;
  if (r === null) return <div className="screen"><BackLink to="/recipes" /><p className="empty">That recipe was deleted.</p></div>;

  const made = today();
  const useBy = addDays(made, days);
  const fmt = (d: Date) => `${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
  const kid = r.kid_portion ?? 0.5;
  const total = adultCount + kidCount;
  const cur = SIZES.find((s) => s.id === size)!;
  const k = (adultPortion: boolean) => (adultPortion ? 1 : kid);
  const macroText = (adultPortion: boolean) => {
    const m = k(adultPortion);
    const p = Math.round((r.protein || 0) * m), c = Math.round((r.carbs || 0) * m), f = Math.round((r.fat || 0) * m);
    return { cal: caloriesFrom(p, c, f), p, c, f };
  };
  const hasMacros = !!(r.protein || r.carbs || r.fat);
  const labels = [
    ...Array.from({ length: adultCount }, (_, i) => ({ adult: true, n: i + 1, of: adultCount })),
    ...Array.from({ length: kidCount }, (_, i) => ({ adult: false, n: i + 1, of: kidCount })),
  ];

  async function print() {
    if (toFreezer && total > 0) {
      const name = `${r!.title} (meal prep)`;
      const hit = (inventory || []).find((i) => i.name === name && i.location === 'freezer');
      const portions = adultCount + kidCount * kid;
      if (hit) await patch('inventory', hit.id, { qty: +(hit.qty + portions).toFixed(2), expires_on: ymd(useBy), note: `Meal prep · made ${fmt(made)}` });
      else await add('inventory', { name, location: 'freezer', qty: +portions.toFixed(2), unit: 'portions', low: 0, par: +portions.toFixed(2), expires_on: ymd(useBy), note: `Meal prep · made ${fmt(made)}` } as Omit<InventoryRec, 'id' | 'household'>);
      toast({ text: `Added ${fmtQty(portions)} portions to Freezer` });
    }
    setTimeout(() => window.print(), 50);
  }

  const Label = ({ adult, n, of }: { adult: boolean; n: number; of: number }) => {
    const m = macroText(adult);
    return (
      <div className={`label-preview size-${size}`}>
        <div className="lrow" style={{ alignItems: 'baseline' }}>
          <span className="lname">{r!.title}</span>
          <span style={{ whiteSpace: 'nowrap' }}>{adult ? 'Adult' : 'Kid'} portion · {n} of {of}</span>
        </div>
        <div className="lrow"><span><b>Prepped</b> {fmt(made)}</span><span><b>Use by</b> {fmt(useBy)}</span></div>
        {macros && hasMacros && <div className="lmac"><span>{m.cal} cal</span><span>P {m.p}g</span><span>C {m.c}g</span><span>F {m.f}g</span></div>}
        {reheat && r!.reheat && <span className="lnote">Reheat: {r!.reheat}</span>}
      </div>
    );
  };

  return (
    <div className="screen">
      <style>{`@media print { @page { size: ${cur.page}; margin: ${size === '5160' ? '0.5in 0.19in' : '0'}; } }`}</style>
      <header className="screen-header compact no-print">
        <BackLink fallback={`/recipes/${r.id}`} />
        <h1 className="display h1">Meal prep labels</h1>
      </header>
      <main className="screen-main no-fab no-print">
        <p className="small muted" style={{ margin: 0 }}>Preview · {cur.name}</p>
        <Label adult={!kidPreview} n={1} of={kidPreview ? Math.max(1, kidCount) : Math.max(1, adultCount)} />

        <section className="glass card" aria-label="Label options" style={{ gap: 12 }}>
          <div className="field">
            <span>Label size</span>
            <div className="chips">
              {SIZES.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={s.id === size} onClick={() => setSize(s.id)}>{s.label}</button>)}
            </div>
          </div>
          <div className="spread" style={{ alignItems: 'center' }}><span>Adult portions</span><Stepper label="adult labels" value={adultCount} onChange={setAdultCount} /></div>
          <div className="spread" style={{ alignItems: 'center' }}><span>Kid portions</span><Stepper label="kid labels" value={kidCount} onChange={setKidCount} /></div>
          <div className="spread" style={{ alignItems: 'center' }}><span>Use within</span><div className="stepper"><button type="button" aria-label="Fewer days" onClick={() => setDays(Math.max(1, days - 1))}>−</button><span className="val">{days} days</span><button type="button" aria-label="More days" onClick={() => setDays(Math.min(180, days + 1))}>+</button></div></div>
          <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={macros && hasMacros} onChange={() => setMacros(!macros)} disabled={!hasMacros} />Show calories &amp; macros{!hasMacros && <span className="tiny muted"> (add them to the recipe)</span>}</label>
          <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={reheat && !!r.reheat} onChange={() => setReheat(!reheat)} disabled={!r.reheat} />Show reheat note{!r.reheat && <span className="tiny muted"> (add one to the recipe)</span>}</label>
          <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={kidPreview} onChange={() => setKidPreview(!kidPreview)} />Preview a kid portion label</label>
          <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={toFreezer} onChange={() => setToFreezer(!toFreezer)} />Add these portions to Freezer inventory</label>
        </section>

        <button type="button" className="btn btn-primary btn-block" disabled={total === 0} onClick={print}><IconPrint /> Print {total} label{total === 1 ? '' : 's'}</button>
        <p className="tiny muted" style={{ margin: 0 }}>Opens your phone's print menu. Label printers: pick the matching paper size there too.</p>
      </main>

      <div className={`print-sheet print-${size}`} aria-hidden="true">
        {labels.map((l, i) => <Label key={i} {...l} />)}
      </div>
    </div>
  );
}
