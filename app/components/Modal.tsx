'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, subtitle, eyebrow, icon, tone, onClose, children }: { title: string; subtitle?: string; eyebrow?: string; icon?: React.ReactNode; tone?: 'new' | 'renewal'; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; if (!dialog.open) dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={tone ? `modal toned tone-${tone}` : 'modal'} onCancel={e => { e.preventDefault(); onClose?.(); }} aria-labelledby="modal-title">
    <div className="modal-head">{icon ? <span className="modal-icon" aria-hidden="true">{icon}</span> : null}<div className="modal-heading">{eyebrow ? <span className="modal-eyebrow">{eyebrow}</span> : null}<h2 id="modal-title">{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{onClose ? <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button> : null}</div>
    {children}
  </dialog>;
}
