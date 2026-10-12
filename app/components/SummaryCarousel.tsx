'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, Clock } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { summarizeLoans, type SummaryPeriod } from '../../lib/loan-summary';

const periods: SummaryPeriod[] = ['today', 'all', 'month'];
const labels = { today: 'Today', month: 'This Month', all: 'All Time' };

export default function SummaryCarousel({ loans, loading, onStatus }: { loans: Loan[]; loading: boolean; onStatus: (status: 'pending' | 'sanctioned') => void }) {
  const [period, setPeriod] = useState<SummaryPeriod>('today');
  const touchStart = useRef<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const activeIndex = periods.indexOf(period);
  const cycle = (direction: number) => setPeriod(periods[(activeIndex + direction + periods.length) % periods.length]);
  const displayPeriods = [periods[(activeIndex + 2) % 3], period, periods[(activeIndex + 1) % 3]];
  return <>
    <div className="summary-carousel" aria-label="Loan summary by period" tabIndex={0}
      onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); cycle(e.key === 'ArrowRight' ? 1 : -1); } }}
      onTouchStart={e => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={e => { if (touchStart.current !== null) { const distance = touchStart.current - e.changedTouches[0].clientX; if (Math.abs(distance) > 35) cycle(distance > 0 ? 1 : -1); touchStart.current = null; } }}>
      {displayPeriods.map((id, index) => {
        const central = index === 1;
        const counts = now ? summarizeLoans(loans, id, now) : { pending: 0, sanctioned: 0 };
        const Icon = id === 'all' ? ChartNoAxesColumnIncreasing : CalendarDays;
        return <article key={id} className={`summary-card ${central ? 'featured' : 'compact'} position-${index}`} aria-label={`${labels[id]} summary`}>
          <div className="summary-card-heading"><button type="button" onClick={() => setPeriod(id)} aria-label={`Show ${labels[id]} summary`}><Icon aria-hidden="true"/><span>{labels[id]}</span></button>{central && id === 'today' ? <time dateTime={now?.toISOString()}>{now ? now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</time> : null}</div>
          <div className="summary-counts">
            <button type="button" className="summary-count pending-count" onClick={() => onStatus('pending')} aria-label={`${labels[id]}: ${counts.pending} pending, show pending applications`}><span className="summary-number"><Clock aria-hidden="true"/><strong>{loading ? '—' : counts.pending}</strong></span><span>Pending</span></button>
            <button type="button" className="summary-count sanctioned-count" onClick={() => onStatus('sanctioned')} aria-label={`${labels[id]}: ${counts.sanctioned} sanctioned, show sanctioned applications`}><span className="summary-number"><CircleCheck aria-hidden="true"/><strong>{loading ? '—' : counts.sanctioned}</strong></span><span>Sanctioned</span></button>
          </div>
        </article>;
      })}
    </div>
    <div className="summary-pagination" aria-label="Summary period">{(['today', 'month', 'all'] as SummaryPeriod[]).map(id => <button key={id} type="button" onClick={() => setPeriod(id)} aria-label={`Show ${labels[id]}`} aria-pressed={id === period}/>)}</div>
  </>;
}
