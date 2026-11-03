'use client';
import { useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, Clock, Undo2 } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { periodLabels as labels, summarizeLoans, type SummaryPeriod } from '../../lib/loan-summary';

const periods: SummaryPeriod[] = ['today', 'all', 'month'];
type Status = Loan['status'];
const statusLabels: Record<Status, string> = { pending: 'pending', sanctioned: 'sanctioned', returned: 'returned' };
const statusIcons = { pending: Clock, sanctioned: CircleCheck, returned: Undo2 };

// Long counts step down a size so they stay inside their third of the card.
const digits = (count: number) => Math.min(String(count).length, 4);
export default function SummaryCarousel({
  loans,
  loading,
  now,
  active,
  onStatus,
}: {
  loans: Loan[];
  loading: boolean;
  now: Date | null;
  /** The status and period currently filtering the list, so the matching box is shown as selected. */
  active: { status: Status; period: SummaryPeriod } | null;
  onStatus: (status: Status, period: SummaryPeriod) => void;
}) {
  const [period, setPeriod] = useState<SummaryPeriod>('today');
  const touchStart = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [wrapping, setWrapping] = useState<SummaryPeriod | null>(null);
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
                  {(['pending', 'sanctioned', 'returned'] as Status[]).map((status) => {
                    const StatusIcon = statusIcons[status];
                    const selected = active?.status === status && active.period === id;
                    return (
                      <button
                        key={status}
                        type="button"
                        className={`summary-count ${status}-count${selected ? ' active' : ''}`}
                        onClick={() => {
                          // Tapping a box on a side card also brings that card to the front.
                          select(id);
                          onStatus(status, id);
                        }}
                        aria-pressed={selected}
                        aria-label={`${labels[id]}: ${counts[status]} ${statusLabels[status]}, show these applications`}
                      >
                        <span className="summary-number">
                          <StatusIcon aria-hidden="true" />
                          <strong data-digits={digits(counts[status])}>{loading ? '—' : counts[status]}</strong>
                        </span>
                        <span>{status[0].toUpperCase() + status.slice(1)}</span>
                      </button>
                    );
                  })}
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
