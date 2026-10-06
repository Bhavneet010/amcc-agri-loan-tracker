'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; if (!dialog.open) dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose?.(); }} aria-labelledby="modal-title">
    <div className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{onClose ? <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button> : null}</div>
    {children}
  </dialog>;
}
