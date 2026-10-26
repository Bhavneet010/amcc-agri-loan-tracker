'use client';

import { useEffect, useState } from 'react';
import type { KccSeasonName } from '../../lib/kcc';
import { kccCrops, type KccCrop } from '../../lib/kcc-sof';
import styles from './KccCalculator.module.css';

const cropsById = new Map(kccCrops.map((crop) => [crop.id, crop]));
const normalize = (text: string) => text.toLowerCase().replace(/[–—/()&,+.-]/g, ' ');
const searchText = new Map(kccCrops.map((crop) => [crop.id, normalize(crop.label)]));
// Workbook rows 83 onward are tea, sugarcane, orchards, flowers, medicinal plants and other long-duration activities.
const prefersLongTerm = (crop: KccCrop) => crop.sourceRow >= 83;

function suggestions(query: string, season: KccSeasonName): KccCrop[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = kccCrops.filter((crop) => words.every((word) => searchText.get(crop.id)!.includes(word)));
  const preferred = (crop: KccCrop) => (season === 'longTerm') === prefersLongTerm(crop);
  // Crop names that start with the typed text come first, then crops usual for the selected season.
  const starts = (crop: KccCrop) => !!words.length && searchText.get(crop.id)!.startsWith(words[0]);
  return [...matches].sort(
    (a, b) => Number(starts(b)) - Number(starts(a)) || Number(preferred(b)) - Number(preferred(a)),
  );
}

export default function KccCropPicker({
  id,
  cropId,
  season,
  onChange,
  onPick,
}: {
  id: string;
  cropId: string;
  season: KccSeasonName;
  onChange: (cropId: string) => void;
  /** Called after a crop is chosen from the suggestions, e.g. to move on to the area. */
  onPick?: () => void;
}) {
  const [query, setQuery] = useState(() => cropsById.get(cropId)?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = open ? suggestions(query === cropsById.get(cropId)?.label ? '' : query, season) : [];
  const listId = `${id}-suggestions`;
  const activeId = open && options[active] ? `${listId}-${options[active].id}` : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  function choose(crop: KccCrop) {
    setQuery(crop.label);
    setOpen(false);
    onChange(crop.id);
    onPick?.();
  }
  return (
    <div className={styles.cropPicker}>
      <label htmlFor={id}>
        Crop & condition
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="Type a crop, e.g. wheat or apple"
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          value={query}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            const exact = kccCrops.find((crop) => normalize(crop.label).trim() === normalize(query).trim());
            if (exact) {
              setQuery(exact.label);
              if (exact.id !== cropId) onChange(exact.id);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
            if (cropId) onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) return setOpen(true);
              if (!options.length) return;
              setActive((current) =>
                event.key === 'ArrowDown'
                  ? (current + 1) % options.length
                  : (current <= 0 ? options.length : current) - 1,
              );
            } else if (event.key === 'Enter' && open && options.length) {
              // Enter without a highlighted suggestion takes the best match.
              event.preventDefault();
              choose(options[Math.max(active, 0)]);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </label>
      {open ? (
        <ul id={listId} role="listbox" className={styles.suggestions} aria-label="Crop suggestions">
          {options.length ? (
            options.map((crop, index) => (
              <li
                key={crop.id}
                id={`${listId}-${crop.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? styles.activeSuggestion : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(crop)}
              >
                {crop.label}
              </li>
            ))
          ) : (
            <li role="option" aria-disabled="true" aria-selected={false} className={styles.noSuggestion}>
              No matching crop in the Scale of Finance
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
