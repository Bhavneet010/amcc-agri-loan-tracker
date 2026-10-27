'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, Clock, Undo2 } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { summarizeLoans, type SummaryPeriod } from '../../lib/loan-summary';

const periods: SummaryPeriod[] = ['today', 'all', 'month'];
const labels = { today: 'Today', month: 'This Month', all: 'All Time' };

// Long counts step down a size so they stay inside their third of the card.
const digits = (count: number) => Math.min(String(count).length, 4);
export default function SummaryCarousel({
  loans,
  loading,
  onStatus,
}: {
  loans: Loan[];
  loading: boolean;
  onStatus: (status: Loan['status']) => void;
}) {
  const [period, setPeriod] = useState<SummaryPeriod>('today');
  const touchStart = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [wrapping, setWrapping] = useState<SummaryPeriod | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const activeIndex = periods.indexOf(period);
  const slotOf = (id: SummaryPeriod, active = activeIndex) => (periods.indexOf(id) - active + 4) % 3;
  const select = (next: SummaryPeriod) => {
    if (next === period) return;
    const nextIndex = periods.indexOf(next);
    // The card that jumps between the two side slots travels behind the featured card.
    setWrapping(periods.find((id) => Math.abs(slotOf(id) - slotOf(id, nextIndex)) === 2) ?? null);
    setPeriod(next);
  };
  const cycle = (direction: number) => select(periods[(activeIndex + direction + periods.length) % periods.length]);
  return (
    <>
      <div
        className={`summary-carousel${drag ? ' dragging' : ''}`}
        style={{ '--drag': `${drag}px` } as CSSProperties}
        aria-label="Loan summary by period"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            cycle(e.key === 'ArrowRight' ? 1 : -1);
          }
        }}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          if (touchStart.current !== null) {
            const delta = e.touches[0].clientX - touchStart.current;
            setDrag(Math.sign(delta) * Math.min(Math.abs(delta) * 0.35, 48));
          }
        }}
        onTouchCancel={() => {
          touchStart.current = null;
          setDrag(0);
        }}
        onTouchEnd={(e) => {
          if (touchStart.current !== null) {
            const distance = touchStart.current - e.changedTouches[0].clientX;
            if (Math.abs(distance) > 35) cycle(distance > 0 ? 1 : -1);
            touchStart.current = null;
          }
          setDrag(0);
        }}
      >
        {periods.map((id) => {
          const index = slotOf(id);
          const central = index === 1;
          const counts = now ? summarizeLoans(loans, id, now) : { pending: 0, sanctioned: 0, returned: 0 };
          const Icon = id === 'all' ? ChartNoAxesColumnIncreasing : CalendarDays;
          return (
            <article
              key={id}
              className={`summary-card ${central ? 'featured' : 'compact'} position-${index}${wrapping === id ? ' wrapping' : ''}`}
              aria-label={`${labels[id]} summary`}
              onTransitionEnd={(e) => {
                if (e.target === e.currentTarget && e.propertyName === 'left' && wrapping === id) setWrapping(null);
              }}
            >
              <div className="summary-card-body" key={index}>
                <div className="summary-card-heading">
                  <button type="button" onClick={() => select(id)} aria-label={`Show ${labels[id]} summary`}>
                    <Icon aria-hidden="true" />
                    <span>{labels[id]}</span>
                  </button>
                  {central && id === 'today' ? (
                    <time dateTime={now?.toISOString()}>
                      {now
                        ? now.toLocaleDateString('en-GB', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </time>
                  ) : null}
                </div>
                <div className="summary-counts">
                  <button
                    type="button"
                    className="summary-count pending-count"
                    onClick={() => onStatus('pending')}
                    aria-label={`${labels[id]}: ${counts.pending} pending, show pending applications`}
                  >
                    <span className="summary-number">
                      <Clock aria-hidden="true" />
                      <strong data-digits={digits(counts.pending)}>{loading ? '—' : counts.pending}</strong>
                    </span>
                    <span>Pending</span>
                  </button>
                  <button
                    type="button"
                    className="summary-count sanctioned-count"
                    onClick={() => onStatus('sanctioned')}
                    aria-label={`${labels[id]}: ${counts.sanctioned} sanctioned, show sanctioned applications`}
                  >
                    <span className="summary-number">
                      <CircleCheck aria-hidden="true" />
                      <strong data-digits={digits(counts.sanctioned)}>{loading ? '—' : counts.sanctioned}</strong>
                    </span>
                    <span>Sanctioned</span>
                  </button>
                  <button
                    type="button"
                    className="summary-count returned-count"
                    onClick={() => onStatus('returned')}
                    aria-label={`${labels[id]}: ${counts.returned} returned, show returned applications`}
                  >
                    <span className="summary-number">
                      <Undo2 aria-hidden="true" />
                      <strong data-digits={digits(counts.returned)}>{loading ? '—' : counts.returned}</strong>
                    </span>
                    <span>Returned</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="summary-pagination" aria-label="Summary period">
        {(['today', 'month', 'all'] as SummaryPeriod[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            aria-label={`Show ${labels[id]}`}
            aria-pressed={id === period}
          />
        ))}
      </div>
    </>
  );
}
