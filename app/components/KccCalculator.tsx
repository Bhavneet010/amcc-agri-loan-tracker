'use client';

import { useId, useRef, useState } from 'react';
import { Calculator, ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  areaInAcres,
  blankKccInput,
  blankKccRow,
  calculateKcc,
  type AreaInput,
  type KccInput,
  type KccRow,
  type KccSeasonResult,
} from '../../lib/kcc';
import { kccCrops, kccDistricts } from '../../lib/kcc-sof';
import Modal from './Modal';
import KccAreaInput from './KccAreaInput';
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
const cropGroups = [
  { label: 'Field crops & vegetables', crops: kccCrops.filter((crop) => crop.sourceRow < 87) },
  { label: 'Horticulture & other activities', crops: kccCrops.filter((crop) => crop.sourceRow >= 87) },
];
type SeasonName = 'kharif' | 'rabi';

function SeasonSection({
  name,
  season,
  result,
  onChange,
  showErrors,
  newId,
}: {
  name: SeasonName;
  season: KccInput[SeasonName];
  result: KccSeasonResult;
  onChange: (season: KccInput[SeasonName]) => void;
  showErrors: boolean;
  newId: () => string;
}) {
  const title = name === 'kharif' ? 'Kharif' : 'Rabi';
  function updateRow(index: number, row: KccRow) {
    onChange({ ...season, rows: season.rows.map((current, i) => (i === index ? row : current)) });
  }
  return (
    <section className={styles.section} data-season={name} aria-labelledby={`${name}-heading`}>
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>{name === 'kharif' ? '02' : '03'} / Crop pattern</span>
          <h3 id={`${name}-heading`}>{title} crops</h3>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={season.enabled}
            onChange={(event) => onChange({ ...season, enabled: event.target.checked })}
          />
          Include {title}
        </label>
      </div>
      {season.enabled ? (
        <>
          <p className={styles.intro}>Recorded crop areas determine each crop’s share of cultivated acres.</p>
          <div className={styles.cropList}>
            {season.rows.map((row, index) => {
              const calculated = result.rows[index];
              const touched = !!row.cropId || row.area.values.some((value) => value.trim());
              const id = `${name}-${row.id}`;
              return (
                <article key={row.id} className={styles.cropCard} aria-label={`${title} crop ${index + 1}`}>
                  <div className={styles.cropHead}>
                    <span>Crop {String(index + 1).padStart(2, '0')}</span>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${title} crop ${index + 1}`}
                      onClick={() =>
                        onChange({ ...season, rows: season.rows.filter((current) => current.id !== row.id) })
                      }
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                  <label htmlFor={`${id}-crop`}>
                    Crop & condition
                    <select
                      id={`${id}-crop`}
                      value={row.cropId}
                      onChange={(event) => updateRow(index, { ...row, cropId: event.target.value })}
                    >
                      <option value="">Select a crop and condition</option>
                      {cropGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.crops.map((crop) => (
                            <option key={crop.id} value={crop.id}>
                              {crop.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div className={styles.rateLine}>
                    <span>Scale of Finance</span>
                    <strong>
                      {showMoney(calculated?.rate ?? null)} <span>/ acre</span>
                    </strong>
                  </div>
                  {calculated && specialBasis.test(calculated.label) ? (
                    <p className={styles.basisNote}>
                      The source label specifies a cultivation/activity size. This beta follows the workbook’s confirmed
                      per-acre calculation; review this entry’s basis before use.
                    </p>
                  ) : null}
                  <KccAreaInput id={id} value={row.area} onChange={(area) => updateRow(index, { ...row, area })} />
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
                      <dt>Crop share</dt>
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
            })}
          </div>
          <div className={styles.seasonFooter}>
            <button
              type="button"
              className="button"
              onClick={() => onChange({ ...season, rows: [...season.rows, blankKccRow(newId())] })}
            >
              <Plus size={16} />
              Add {title} crop
            </button>
            <div>
              <span>{title} finance</span>
              <strong>{showMoney(result.finance)}</strong>
            </div>
          </div>
          {!season.rows.length ? (
            <p className={styles.error}>Add a crop, or turn this season off if it is unused.</p>
          ) : null}
        </>
      ) : (
        <p className={styles.intro}>
          This season is excluded. Its entries are kept until you reset or close the calculator.
        </p>
      )}
    </section>
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
            <p className={styles.intro}>Cultivated acres apply to each included season. Total land is optional.</p>
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
          {(['kharif', 'rabi'] as const).map((name) => (
            <SeasonSection
              key={name}
              name={name}
              season={input[name]}
              result={result[name]}
              showErrors={showErrors}
              newId={() => `added-${++nextRow.current}`}
              onChange={(season) => update({ [name]: season })}
            />
          ))}
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
                For each season: crop share = recorded crop area ÷ total recorded crop area. Borrower crop acres = crop
                share × cultivated acres. Crop finance = borrower crop acres × district Scale of Finance.
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
            <div>
              <dt>Kharif finance{!input.kharif.enabled ? ' (excluded)' : ''}</dt>
              <dd>{showMoney(result.kharif.finance)}</dd>
            </div>
            <div>
              <dt>Rabi finance{!input.rabi.enabled ? ' (excluded)' : ''}</dt>
              <dd>{showMoney(result.rabi.finance)}</dd>
            </div>
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
