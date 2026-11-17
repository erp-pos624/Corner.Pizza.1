import { useEffect, useState, type ReactElement } from 'react';
import '@fontsource/fraunces/latin-500.css';
import './brand-intro.css';

/**
 * The Corner Pizza loading screen: the mark draws itself, fills in and reveals
 * the wordmark, then the cream stage fades away. Shared by the storefront and
 * the desktop app. Reduced-motion visitors skip it entirely.
 */
export function BrandIntro(): ReactElement | null {
  const [phase, setPhase] = useState<'playing' | 'leaving' | 'done'>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'done'
      : 'playing',
  );

  useEffect(() => {
    if (phase !== 'playing') return;
    const leave = (): void => setPhase('leaving');
    const timer = window.setTimeout(leave, 2250);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') leave();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  // Matches the 380ms fade on `.brand-intro.is-leaving`.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('done'), 420);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') return;
    const root = document.documentElement;
    root.classList.add('brand-intro-lock');
    return () => root.classList.remove('brand-intro-lock');
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`brand-intro${phase === 'leaving' ? ' is-leaving' : ''}`}
      aria-hidden="true"
      onClick={() => setPhase((current) => (current === 'playing' ? 'leaving' : current))}
    >
      <div className="brand-intro__bg" />
      <div className="brand-intro__stage">
        <svg
          className="brand-intro__mark"
          viewBox="6323.3 1557.8 6341 6344.7"
          focusable="false"
        >
          <path
            className="ip ip-red ip-b1"
            pathLength="1"
            d="M6323.29 7897.6L11307.17 7902.5L11308.87 7300.63L6930.89 7296.87L6928.37 2906.3L6323.55 2906.24Z"
          />
          <path
            className="ip ip-red ip-b2"
            pathLength="1"
            d="M7674 2159.3L12057.4 2159.86L12059.31 6530.4L12664.3 6530.95L12664.13 1557.84L7673.38 1558.87Z"
          />
          <path
            className="ip ip-green"
            pathLength="1"
            d="M8862.93 3716.03c292.24,44.17 790.52,404.1 990.18,613.74 210.78,221.33 543.82,702.93 586,1000.91l-2385.07 776.16 808.89 -2390.81zm219.16 -614.04c375.31,78.04 971.63,497.39 1229.54,769.16 291.96,307.73 644.89,825.85 745.63,1248.19l-287.33 92.96c-159.91,-442.44 -345.24,-782.85 -673.93,-1125.45 -415.06,-432.67 -699.29,-478.48 -1106.98,-696.91l93.08 -287.96zm-192.22 -368.91c-111.64,58.5 -234.54,534.65 -282.05,672.26l-972.44 2862.75c-155.56,448.78 328.83,241.54 524.67,175.63 479.35,-161.3 962.46,-314.25 1442.5,-474.2 479.85,-159.89 959.46,-321.6 1439.68,-479.95 334.48,-110.31 485.07,-92.69 345.58,-485.56 -85.73,-241.45 -171.87,-446.06 -299.72,-668.96 -227.72,-397.15 -526.87,-750.05 -892.27,-1026.29 -209.18,-158.12 -1072.31,-698.1 -1305.96,-575.68z"
          />
          <path
            className="ip-white"
            d="M8646.59 5352.08c-46.85,-262.57 325.81,-329.13 375.24,-92.12 58.5,280.33 -336.22,310.75 -375.24,92.12zm1336.26 -193.76c-122.05,321.14 -597.26,158.28 -484.64,-184.53 103.93,-316.38 608.48,-141.39 484.64,184.53zm-948.06 -1006.22c334.09,-140.7 487.73,373.25 187.17,487.2 -311.8,118.21 -526.87,-344.09 -187.17,-487.2zm-980.74 1954.74l2385.07 -776.16c-42.18,-297.98 -375.22,-779.57 -586,-1000.91 -199.66,-209.64 -697.94,-569.57 -990.18,-613.74l-808.89 2390.81z"
          />
          <path
            className="ip-white"
            d="M8989.01 3389.95c407.69,218.43 691.92,264.24 1106.98,696.91 328.69,342.61 514.03,683.02 673.93,1125.45l287.33 -92.96c-100.74,-422.34 -453.67,-940.46 -745.63,-1248.19 -257.91,-271.78 -854.23,-691.12 -1229.54,-769.16l-93.08 287.96z"
          />
          <path
            className="ip-dot ip-d1"
            d="M9034.78 4152.11c-339.7,143.11 -124.64,605.41 187.17,487.2 300.56,-113.95 146.93,-627.91 -187.17,-487.2z"
          />
          <path
            className="ip-dot ip-d2"
            d="M9982.85 5158.32c123.84,-325.93 -380.71,-500.91 -484.64,-184.53 -112.63,342.81 362.59,505.67 484.64,184.53z"
          />
          <path
            className="ip-dot ip-d3"
            d="M8646.59 5352.08c39.02,218.63 433.74,188.22 375.24,-92.12 -49.44,-237.01 -422.09,-170.46 -375.24,92.12z"
          />
        </svg>
        <p className="brand-intro__name" dir="ltr">
          Corner Pizza
        </p>
      </div>
    </div>
  );
}
