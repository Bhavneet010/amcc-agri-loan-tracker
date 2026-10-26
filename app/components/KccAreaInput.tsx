'use client';

import { kccAreaUnits, type AreaInput, type AreaUnit } from '../../lib/kcc';
import styles from './KccCalculator.module.css';

export default function KccAreaInput({
  value,
  onChange,
  id,
}: {
  value: AreaInput;
  onChange: (value: AreaInput) => void;
  id: string;
}) {
  const definition = kccAreaUnits.find((unit) => unit.value === value.unit)!;
  const positional = definition.parts.length === 3;
  // Bigha and biswa jump to the next box when their second digit is typed. Going back to bigha to type more
  // digits does not jump again, because the box already held two.
  const autoAdvance = value.unit === 'bigha';
  return (
    <div className={styles.areaInput}>
      <label htmlFor={`${id}-unit`}>
        Recorded area unit
        <select
          id={`${id}-unit`}
          value={value.unit}
          onChange={(event) =>
            onChange({ unit: event.target.value as AreaUnit, values: ['', '', ''], karam: value.karam })
          }
          aria-describedby={`${id}-unit-note`}
        >
          {kccAreaUnits.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
      <div className={positional ? styles.areaParts : styles.decimalArea}>
        {definition.parts.map((part, index) => (
          <label key={`${value.unit}-${index}`} htmlFor={`${id}-part-${index}`}>
            {part}
            <input
              id={`${id}-part-${index}`}
              type="text"
              inputMode={positional ? 'numeric' : 'decimal'}
              value={value.values[index]}
              placeholder={positional ? '0' : 'Enter area'}
              autoComplete="off"
              onChange={(event) => {
                const text = event.target.value;
                const values: AreaInput['values'] = [...value.values];
                values[index] = text;
                onChange({ ...value, values });
                if (autoAdvance && index < 2 && /^\d{2}$/.test(text) && value.values[index].length < 2)
                  document.getElementById(`${id}-part-${index + 1}`)?.focus();
              }}
            />
          </label>
        ))}
      </div>
      <p id={`${id}-unit-note`} className={styles.hint}>
        Changing the unit clears this row’s area.
        {positional ? ' Read the three parts separately; blank parts count as zero.' : ''}
      </p>
      {value.unit === 'kanal' ? (
        <div className={styles.karamNote}>
          <label htmlFor={`${id}-karam`}>
            Karam standard on the land record
            <select
              id={`${id}-karam`}
              value={value.karam}
              onChange={(event) => onChange({ ...value, karam: event.target.value as AreaInput['karam'] })}
            >
              <option value="">Not confirmed</option>
              <option value="66">Confirmed: 66-inch karam</option>
              <option value="57.5">Confirmed: 57.5-inch karam</option>
            </select>
          </label>
          <p>
            Confirm the karam with the Patwari, or use the hectare–are–centiare Rakba from the Jamabandi. The two
            standards give different areas.
          </p>
        </div>
      ) : value.unit === 'bigha' ? (
        <p className={styles.hint}>HP standard: 20 biswansi = 1 biswa; 20 biswa = 1 bigha; 5 bigha = 1 acre.</p>
      ) : null}
    </div>
  );
}
