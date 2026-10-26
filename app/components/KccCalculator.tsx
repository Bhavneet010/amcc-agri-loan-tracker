'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Calculator, ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  areaInAcres,
  blankKccInput,
  blankKccRow,
  calculateKcc,
  kccRowError,
  kccSeasons,
  parseSavedKccInput,
  seasonLabel,
  type AreaInput,
  type KccInput,
  type KccRow,
  type KccRowResult,
  type KccSeasonName,
} from '../../lib/kcc';
import { kccCrops, kccDistricts } from '../../lib/kcc-sof';
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
const acres = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });
const showAcres = (value: number | null) => (value === null ? '—' : acres.format(value));
const specialBasis = /(protected|sqm|colony|bags|term loan|green house)/i;
const cropsById = new Map(kccCrops.map((crop) => [crop.id, crop]));
// Inputs stay in this browser until Reset, so closing the calculator or the app does not lose them.
const savedInputKey = 'kcc-calculator-input';

function loadSavedInput(): KccInput {
  try {
    return parseSavedKccInput(localStorage.getItem(savedInputKey)) ?? blankKccInput();
  } catch {
    return blankKccInput();
  }
}
/** The crop name before its condition, e.g. "Wheat" from "Wheat — Irrigated". Dashes inside brackets stay. */
function cropName(label: string) {
  let depth = 0;
  for (let index = 0; index < label.length; index++) {
    const char = label[index];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (!depth && /\s[—–-]\s/.test(label.slice(index - 1, index + 2))) return label.slice(0, index).trim();
  }
  return label;
}

function CropEditor({
  initial,
  isNew,
  district,
  onSave,
  onClose,
}: {
  initial: KccRow;
  isNew: boolean;
  district: string;
  onSave: (row: KccRow, next: boolean) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState(initial);
  const [tried, setTried] = useState(false);
  const id = `crop-${row.id}`;
  const crop = cropsById.get(row.cropId);
  const rate = crop?.rates[kccDistricts.findIndex((name) => name === district)] ?? null;
  const error = kccRowError(row, district);
  const touched = !!row.cropId || row.area.values.some((value) => value.trim());
  return (
    <Modal
      title={isNew ? `Add ${seasonLabel(row.season)} crop` : 'Edit crop'}
      titleId={`${id}-title`}
      className={styles.editor}
      onClose={onClose}
    >
      <form
        className={styles.editorBody}
        data-season={row.season}
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (!error) onSave(row, submitter?.value === 'next');
        }}
      >
        <label htmlFor={`${id}-season`}>
          Season
          <select
            id={`${id}-season`}
            value={row.season}
            onChange={(event) => setRow({ ...row, season: event.target.value as KccSeasonName })}
          >
            {kccSeasons.map((season) => (
              <option key={season.value} value={season.value}>
                {season.label}
              </option>
            ))}
          </select>
        </label>
        <KccCropPicker
          id={`${id}-crop`}
          cropId={row.cropId}
          season={row.season}
          onChange={(cropId) => setRow({ ...row, cropId })}
        />
        <div className={styles.rateLine}>
          <span>Scale of Finance</span>
          <strong>
            {showMoney(rate)} <span>/ acre</span>
          </strong>
        </div>
        {crop && specialBasis.test(crop.label) ? (
          <p className={styles.basisNote}>
            The source label specifies a cultivation/activity size. This beta follows the workbook’s confirmed per-acre
            calculation; review this entry’s basis before use.
          </p>
        ) : null}
        <KccAreaInput id={id} value={row.area} onChange={(area) => setRow({ ...row, area })} />
        {error && (touched || tried) ? (
          <p className={styles.error} role="status">
            {error}
          </p>
        ) : null}
        <div className={styles.editorActions}>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={isNew ? 'button' : 'button primary'} value="close">
            Save and Close
          </button>
          {isNew ? (
            <button type="submit" className="button primary" value="next">
              Save and Next
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function CropTable({
  rows,
  results,
  total,
  onEdit,
  onRemove,
}: {
  rows: KccRow[];
  results: KccRowResult[];
  total: number | null;
  onEdit: (row: KccRow) => void;
  onRemove: (row: KccRow) => void;
}) {
  return (
    <div className={styles.cropTable} role="table" aria-label="Crop pattern">
      <div className={styles.cropHeader} role="row">
        <span role="columnheader">Season</span>
        <span role="columnheader">Crop</span>
        <span role="columnheader">Acres</span>
        <span role="columnheader">Finance</span>
        <span role="columnheader">
          <span className="sr-only">Remove</span>
        </span>
      </div>
      {rows.map((row, index) => {
        const result = results[index];
        return (
          <div key={row.id} className={styles.cropRow} role="row" data-season={row.season}>
            <span role="cell">
              <span className={styles.seasonTag}>{seasonLabel(row.season)}</span>
            </span>
            <span role="cell">
              <button
                type="button"
                className={styles.cropName}
                onClick={() => onEdit(row)}
                title={result?.label}
                aria-label={`Edit ${result?.label}`}
              >
                {result ? cropName(result.label) : null}
              </button>
            </span>
            <span role="cell" className={styles.num}>
              {showAcres(result?.borrowerAcres ?? null)}
              {row.season === 'longTerm' && result?.finance !== null && result?.seasonAcres ? (
                <>
                  <small>K {showAcres(result.seasonAcres.kharif)}</small>
                  <small>R {showAcres(result.seasonAcres.rabi)}</small>
                </>
              ) : null}
            </span>
            <span role="cell" className={styles.num}>
              {showMoney(result?.finance ?? null)}
            </span>
            <span role="cell">
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${result?.label}`}
                onClick={() => onRemove(row)}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        );
      })}
      <div className={styles.cropTotal} role="row">
        <span role="cell">Total crop finance</span>
        <span role="cell" className={styles.num}>
          {showMoney(total)}
        </span>
        <span role="cell" />
      </div>
    </div>
  );
}

export default function KccCalculator({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState(loadSavedInput);
  const [showErrors, setShowErrors] = useState(false);
  const [editing, setEditing] = useState<{ row: KccRow; isNew: boolean } | null>(null);
  const [converter, setConverter] = useState<AreaInput>({ unit: 'bigha', values: ['', '', ''], karam: '' });
  const [converterVersion, setConverterVersion] = useState(0);
  // New crop ids continue after the saved ones.
  const nextRow = useRef(Math.max(0, ...input.crops.map((row) => Number(/^crop-(\d+)$/.exec(row.id)?.[1] ?? 0))));
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
  useEffect(() => {
    try {
      localStorage.setItem(savedInputKey, JSON.stringify(input));
    } catch {
      // Storage can be full or blocked; the calculator still works for this visit.
    }
  }, [input]);
  function update(changes: Partial<KccInput>) {
    setInput((current) => ({ ...current, ...changes }));
  }
  function reset() {
    setInput(blankKccInput());
    setShowErrors(false);
    setEditing(null);
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
            <p className={styles.intro}>Cultivated acres apply to each season. Total land is optional.</p>
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
            {input.crops.length ? (
              <CropTable
                rows={input.crops}
                results={result.rows}
                total={result.baseFinance}
                onEdit={(row) => setEditing({ row, isNew: false })}
                onRemove={(row) => update({ crops: input.crops.filter((current) => current.id !== row.id) })}
              />
            ) : (
              <p className={styles.intro}>No crops added yet.</p>
            )}
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
                      setEditing({ row: blankKccRow(`crop-${++nextRow.current}`, season.value), isNew: true })
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
                As in the workbook, recorded areas only set the crop pattern. Kharif share = recorded crop area ÷ total
                recorded Kharif area; Rabi share is worked out the same way. Borrower crop acres = crop share ×
                cultivated acres. Crop finance = borrower crop acres × district Scale of Finance.
              </p>
              <p>
                Long-term crops (orchards and other crops that take more than a season) occupy their land in both
                seasons, so each is listed in the Kharif and the Rabi pool at its full recorded area. Their Scale of
                Finance is annual, so half of it is counted in each season: long-term finance = (Kharif acres + Rabi
                acres) ÷ 2 × Scale of Finance.
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
                Beta estimate for review. This calculator does not create a loan. Your inputs stay on this device until
                you press Reset.
              </p>
            </div>
          </details>
        </div>
        <aside className={styles.results} ref={summary} tabIndex={-1} aria-label="KCC calculation results">
          {result.annualLimits ? (
            <div className={styles.firstYear} role="status">
              <div>
                <span>Year 1 limit</span>
                <strong>{showMoney(result.annualLimits[0])}</strong>
                <p>Includes 30% additional finance</p>
              </div>
              <div>
                <span>MPL (max. permissible)</span>
                <strong>{showMoney(result.annualLimits[4])}</strong>
                <p>Year 5 limit</p>
              </div>
            </div>
          ) : (
            <div className={styles.pendingResult}>
              <Calculator size={27} />
              <strong>Complete the land & crop details</strong>
              <p>Your five-year limits will update as you enter valid inputs.</p>
            </div>
          )}
          <dl className={styles.breakdown}>
            {kccSeasons.slice(0, 2).map((season) => (
              <div key={season.value}>
                <dt>
                  {season.label} finance{!result.seasons[season.value].used ? ' (no crops)' : ''}
                </dt>
                <dd>{showMoney(result.seasons[season.value].finance)}</dd>
              </div>
            ))}
            {result.seasons.longTerm.used ? (
              <div>
                <dt>Of which long-term (half in each season)</dt>
                <dd>{showMoney(result.seasons.longTerm.finance)}</dd>
              </div>
            ) : null}
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
      {editing ? (
        <CropEditor
          key={editing.row.id}
          initial={editing.row}
          isNew={editing.isNew}
          district={input.district}
          onClose={() => setEditing(null)}
          onSave={(row, next) => {
            update({
              crops: editing.isNew
                ? [...input.crops, row]
                : input.crops.map((current) => (current.id === row.id ? row : current)),
            });
            // Save and Next opens a blank crop in the same season, keeping the area unit just used.
            const blank = blankKccRow(`crop-${++nextRow.current}`, row.season);
            setEditing(
              next
                ? {
                    row: { ...blank, area: { ...blank.area, unit: row.area.unit, karam: row.area.karam } },
                    isNew: true,
                  }
                : null,
            );
          }}
        />
      ) : null}
    </Modal>
  );
}
