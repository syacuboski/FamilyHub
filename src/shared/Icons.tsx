// Stroke icons (24×24, currentColor), matching the mockups' nav set.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 22): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const IconToday = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg>
);
export const IconCalendar = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IconLists = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17" /></svg>
);
export const IconMeals = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z" /><path d="M12 4v3.5M8 5.5l1.2 2.2M16 5.5l-1.2 2.2" /></svg>
);
export const IconHome = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 15l1.5 1.5L14.5 13" /></svg>
);
export const IconBack = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconPlus = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconEdit = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.8} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
);
export const IconTrash = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
);
export const IconRefresh = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.7} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>
);
export const IconRepeat = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>
);
export const IconBell = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
);
export const IconGear = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
);
export const IconCamera = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconPrint = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 14h10v6H7z" /></svg>
);
export const IconSpark = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
    <path d="M15 8v14M8 15h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path transform="translate(24 6) scale(0.55)" d="M0 -7 L1.5 -1.5 L7 0 L1.5 1.5 L0 7 L-1.5 1.5 L-7 0 L-1.5 -1.5Z" fill="currentColor" />
  </svg>
);
