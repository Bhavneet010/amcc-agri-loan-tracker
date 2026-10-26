'use client';

import { useId, useRef, useState } from 'react';
import { Calculator, ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  areaInAcres,
  blankKccInput,
  blankKccRow,
  calculateKcc,
  kccSeasons,
  type AreaInput,
  type KccInput,
  type KccRow,
  type KccRowResult,
  type KccSeasonName,
} from '../../lib/kcc';
import { kccDistricts } from '../../lib/kcc-sof';
import Modal from './Modal';
import KccAreaInput from './KccAreaInput';
import KccCropPicker from './KccCropPicker';
import styles from './KccCalculator.module.css';

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 8 });
const showMoney = (value: number | null) => (value === null ? '—' : money.format(value));
const showArea = (value: number | null) => (value === null ? '—' : number.format(value));
const specialBasis = /(protected|sqm|colony|bags|term loan|green house)/i;
const seasonLabel = (season: KccSeasonName) => kccSeasons.find((option) => option.value === season)!.label;

function CropCard({
  row,
  index,
  calculated,
  onChange,
  onRemove,
  showErrors,
}: {
  row: KccRow;
  index: number;
  calculated: KccRowResult | undefined;
  onChange: (row: KccRow) => void;
  onRemove: () => void;
  showErrors: boolean;
}) {
  const touched = !!row.cropId || row.area.values.some((value) => value.trim());
  const id = `crop-${row.id}`;
  return (
    <article className={styles.cropCard} data-season={row.season} aria-label={`Crop ${index + 1}`}>
      <div className={styles.cropHead}>
        <span>Crop {String(index + 1).padStart(2, '0')}</span>
        <label htmlFor={`${id}-season`} className={styles.seasonPick}>
          <span className="sr-only">Season</span>
          <select
            id={`${id}-season`}
            value={row.season}
            onChange={(event) => onChange({ ...row, season: event.target.value as KccSeasonName })}
          >
            {kccSeasons.map((season) => (
              <option key={season.value} value={season.value}>
                {season.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.remove} aria-label={`Remove crop ${index + 1}`} onClick={onRemove}>
          <Trash2 size={15} />
          Remove
        </button>
      </div>
      <KccCropPicker
        id={`${id}-crop`}
        cropId={row.cropId}
        season={row.season}
        onChange={(cropId) => onChange({ ...row, cropId })}
      />
      <div className={styles.rateLine}>
        <span>Scale of Finance</span>
        <strong>
          {showMoney(calculated?.rate ?? null)} <span>/ acre</span>
        </strong>
      </div>
      {calculated && specialBasis.test(calculated.label) ? (
        <p className={styles.basisNote}>
          The source label specifies a cultivation/activity size. This beta follows the workbook’s confirmed per-acre
          calculation; review this entry’s basis before use.
        </p>
      ) : null}
      <KccAreaInput id={id} value={row.area} onChange={(area) => onChange({ ...row, area })} />
      {calculated?.error && (touched || showErrors) ? (
        <p className={styles.error} role="status">
          {calculated.error}
        </p>
      ) : null}
      <dl className={styles.rowResults}>
        <div>
          <dt>Recorded acres</dt>
          <dd>{showArea(calculated?.recordedAcres ?? null)}</dd>
        </div>
        <div>
          <dt>{seasonLabel(row.season)} share</dt>
          <dd>
            {calculated?.share === null || calculated?.share === undefined
              ? '—'
              : `${(calculated.share * 100).toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt>Borrower acres</dt>
          <dd>{showArea(calculated?.borrowerAcres ?? null)}</dd>
        </div>
        <div>
          <dt>Crop finance</dt>
          <dd>{showMoney(calculated?.finance ?? null)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function KccCalculator({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState(blankKccInput);
  const [showErrors, setShowErrors] = useState(false);
  const [converter, setConverter] = useState<AreaInput>({ unit: 'bigha', values: ['', '', ''], karam: '' });
  const [converterVersion, setConverterVersion] = useState(0);
  const nextRow = useRef(0);
  const summary = useRef<HTMLElement>(null);
  const id = useId();
  const result = calculateKcc(input);
  let converted: number | null = null;
  let conversionError = '';
  try {
    converted = areaInAcres(converter);
  } catch (error) {
    conversionError = (error as Error).message;
  }
  function update(changes: Partial<KccInput>) {
    setInput((current) => ({ ...current, ...changes }));
  }
  function reset() {
    setInput(blankKccInput());
    setShowErrors(false);
    setConverter({ unit: 'bigha', values: ['', '', ''], karam: '' });
    setConverterVersion((version) => version + 1);
  }
  return (
    <Modal
      title={
        <span className={styles.title}>
          KCC calculator <span className={styles.beta}>Beta</span>
        </span>
      }
      subtitle="FY 2026–27 · Himachal Pradesh"
      icon={<Calculator size={23} />}
      className={styles.dialog}
      onClose={onClose}
    >
      <div className={styles.toolbar}>
        <button type="button" className={styles.reset} onClick={reset}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
      <div className={styles.layout}>
        <div className={styles.inputs}>
          <section className={styles.section} aria-labelledby="kcc-land-heading">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>01 / Land & district</span>
                <h3 id="kcc-land-heading">Borrower’s land</h3>
              </div>
            </div>
            <div className={styles.landFields}>
              <label htmlFor={`${id}-district`}>
                District
                <select
                  id={`${id}-district`}
                  value={input.district}
                  onChange={(event) => update({ district: event.target.value })}
                >
                  {kccDistricts.map((district) => (
                    <option key={district}>{district}</option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-cultivated`}>
                Cultivated land (acres)
                <input
                  id={`${id}-cultivated`}
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 0.12"
                  value={input.cultivatedAcres}
                  onChange={(event) => update({ cultivatedAcres: event.target.value })}
                />
              </label>
              <label htmlFor={`${id}-total`}>
                Total land (acres)
                <input
                  id={`${id}-total`}
                  type="text"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={input.totalAcres}
                  onChange={(event) => update({ totalAcres: event.target.value })}
                />
              </label>
            </div>
            <p className={styles.intro}>Cultivated acres apply to each crop group. Total land is optional.</p>
            <details key={converterVersion} className={styles.converter}>
              <summary>
                Convert borrower’s land to acres <ChevronDown size={15} />
              </summary>
              <div>
                <KccAreaInput id={`${id}-converter`} value={converter} onChange={setConverter} />
                <div className={styles.converterResult}>
                  <strong>{showArea(converted)} acres</strong>
                  <button
                    type="button"
                    className="button"
                    disabled={converted === null || converted <= 0}
                    onClick={() => {
                      if (converted !== null) update({ cultivatedAcres: String(converted) });
                    }}
                  >
                    Use as cultivated land
                  </button>
                </div>
                {conversionError && converter.values.some((value) => value.trim()) ? (
                  <p className={styles.error}>{conversionError}</p>
                ) : null}
              </div>
            </details>
          </section>
          <section className={styles.section} aria-labelledby="kcc-crops-heading">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>02 / Crop pattern</span>
                <h3 id="kcc-crops-heading">Crops</h3>
              </div>
            </div>
            <p className={styles.intro}>
              Add each crop under Kharif, Rabi or Long-term. Within each, recorded crop areas set each crop’s share of
              the cultivated acres.
            </p>
            {input.crops.length ? (
              <div className={styles.cropList}>
                {input.crops.map((row, index) => (
                  <CropCard
                    key={row.id}
                    row={row}
                    index={index}
                    calculated={result.rows[index]}
                    showErrors={showErrors}
                    onChange={(changed) =>
                      update({ crops: input.crops.map((current) => (current.id === row.id ? changed : current)) })
                    }
                    onRemove={() => update({ crops: input.crops.filter((current) => current.id !== row.id) })}
                  />
                ))}
              </div>
            ) : null}
            <div className={styles.addCrop}>
              <span>Add crop</span>
              <div>
                {kccSeasons.map((season) => (
                  <button
                    key={season.value}
                    type="button"
                    className="button"
                    data-season={season.value}
                    onClick={() =>
                      update({ crops: [...input.crops, blankKccRow(`crop-${++nextRow.current}`, season.value)] })
                    }
                  >
                    <Plus size={16} />
                    {season.label}
                  </button>
                ))}
              </div>
            </div>
            {!input.crops.length && showErrors ? (
              <p className={styles.error}>Add at least one Kharif, Rabi or long-term crop.</p>
            ) : null}
          </section>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setShowErrors(true);
              summary.current?.focus();
              summary.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
          >
            Check calculation
          </button>
          <details className={styles.method}>
            <summary>Calculation & source notes</summary>
            <div>
              <p>
                Crops are grouped as Kharif, Rabi or Long-term. Within each group: crop share = recorded crop area ÷ the
                group’s total recorded crop area. Borrower crop acres = crop share × cultivated acres. Crop finance =
                borrower crop acres × district Scale of Finance. Groups without crops are left out.
              </p>
              <p>
                Year 1 = total crop finance × 1.30. Each later year = the previous year × 1.10. Values retain full
                precision during calculation.
              </p>
              <p>
                Rates: your “KCC CALCULATION - SOF FY 2026-27 UPDATED.xlsx”, FINAL AGRICULTURE sheet, all 175
                crop/condition rows and 12 districts. Rates are treated as ₹/acre as confirmed for this workbook. Source
                labels and district differences are retained.
              </p>
              <p>
                Conversions: supplied HP desk reference, revised 26 October 2026. 1 acre = 43,560 sq ft = 4,046.8564224
                m². Use certified Jamabandi area and confirm the karam for kanal land.
              </p>
              <p>
                Beta estimate for review. This calculator does not create a loan or save your inputs. Closing it clears
                the calculation.
              </p>
            </div>
          </details>
        </div>
        <aside className={styles.results} ref={summary} tabIndex={-1} aria-label="KCC calculation results">
          <div className={styles.resultHead}>
            <span className={styles.eyebrow}>Your calculation</span>
            <h3>Five-year limit</h3>
            <p>{input.district} · FY 2026–27 basis</p>
          </div>
          {result.annualLimits ? (
            <div className={styles.firstYear} role="status">
              <span>Year 1</span>
              <strong>{showMoney(result.annualLimits[0])}</strong>
              <p>Includes 30% additional finance</p>
            </div>
          ) : (
            <div className={styles.pendingResult}>
              <Calculator size={27} />
              <strong>Complete the land & crop details</strong>
              <p>Your five-year limits will update as you enter valid inputs.</p>
            </div>
          )}
          <dl className={styles.breakdown}>
            {kccSeasons.map((season) => (
              <div key={season.value}>
                <dt>
                  {season.label} finance{!result.seasons[season.value].used ? ' (no crops)' : ''}
                </dt>
                <dd>{showMoney(result.seasons[season.value].finance)}</dd>
              </div>
            ))}
            <div>
              <dt>Total crop finance</dt>
              <dd>{showMoney(result.baseFinance)}</dd>
            </div>
            <div>
              <dt>30% addition</dt>
              <dd>{showMoney(result.baseFinance === null ? null : result.baseFinance * 0.3)}</dd>
            </div>
          </dl>
          <table className={styles.yearTable}>
            <caption>Annual limits (₹)</caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Calculated limit</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((year) => (
                <tr key={year}>
                  <th scope="row">Year {year}</th>
                  <td>{showMoney(result.annualLimits?.[year - 1] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.resultNote}>
            Years 2–5 include a compounded 10% annual increase, using FY 2026–27 rates.
          </p>
          {showErrors && result.errors.length ? (
            <div className={styles.validation} role="alert">
              <strong>Check these inputs</strong>
              <ul>
                {result.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={styles.betaNote}>
            <span className={styles.beta}>Beta</span>
            <p>Review inputs and source rates before using the estimate.</p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
