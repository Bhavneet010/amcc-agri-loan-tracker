'use client';
import { useEffect, useState } from 'react';
import { Camera, ImageIcon, Receipt, Upload } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { request } from '../../lib/types';
import { compressChargeImage } from '../../lib/charge-image';

const size = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Asked on renewals above ₹2 lakh; the branch must answer Yes or No before the loan can be saved.
export function ChargePrompt({
  choice,
  image,
  attached,
  disabled,
  onChoice,
  onImage,
}: {
  choice: 'yes' | 'no' | '';
  image: Blob | null;
  attached: boolean;
  disabled: boolean;
  onChoice: (choice: 'yes' | 'no') => void;
  onImage: (image: Blob | null) => void;
}) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!image) return setPreview('');
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem('');
    setBusy(true);
    try {
      onImage(await compressChargeImage(file));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="charge-prompt" disabled={disabled}>
      <legend>
        <Receipt size={16} aria-hidden="true" /> Upload charge details?
      </legend>
      <div className="charge-choice">
        {(['yes', 'no'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={choice === option ? 'selected' : ''}
            aria-pressed={choice === option}
            onClick={() => onChoice(option)}
          >
            {option === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
      {choice === 'yes' ? (
        <>
          {/* Separate inputs: some Android browsers drop the camera from a combined picker. */}
          <div className="charge-sources">
            <label className="charge-file">
              <input type="file" accept="image/*" capture="environment" onChange={pick} />
              <Camera size={17} aria-hidden="true" />
              Take photo
            </label>
            <label className="charge-file">
              <input type="file" accept="image/*" onChange={pick} />
              <Upload size={17} aria-hidden="true" />
              Upload
            </label>
          </div>
          {busy ? <small>Compressing photo…</small> : null}
          {preview && image ? (
            <figure className="charge-preview">
              <img src={preview} alt="Charge details to upload" />
              <figcaption>Compressed to {size(image.size)} · uploads when you save</figcaption>
            </figure>
          ) : attached ? (
            <small>A charge details image is already attached. Choose a photo only to replace it.</small>
          ) : null}
        </>
      ) : null}
      {choice === 'no' && attached ? <small>The attached image will be removed when you save.</small> : null}
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

// Shows the branch's answer to the admin, and the saved image to the branch; links are short-lived and fetched on request.
export function ChargeReview({ loan }: { loan: Loan }) {
  const details = loan.chargeDetails;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (!details) return null;
  async function view() {
    setBusy(true);
    setProblem('');
    try {
      setUrl((await request<{ url: string }>(`/api/loans/${loan.id}/charge`)).url);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-summary charge-review">
      <span>Charge details</span>
      {details.choice === 'no' ? (
        <strong>Branch chose not to upload</strong>
      ) : details.hasImage ? (
        url ? (
          <a className="charge-preview" href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={`Charge details for ${loan.atsId}`} />
            <small>Tap to open full size</small>
          </a>
        ) : (
          <button type="button" className="button secondary" onClick={view} disabled={busy}>
            <ImageIcon size={16} aria-hidden="true" /> {busy ? 'Loading…' : 'View charge details'}
          </button>
        )
      ) : loan.status === 'sanctioned' ? (
        <strong>Image removed after sanction</strong>
      ) : (
        <strong>Branch chose to upload · image not added yet</strong>
      )}
      {details.hasImage ? <small>The image is deleted automatically when this loan is sanctioned.</small> : null}
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
