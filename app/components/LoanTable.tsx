'use client';
import { ArrowUpRight, Check, CircleDashed, Eye, FileText, Pencil } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { branchCode, dateLabel, lakhs, rupees } from '../../lib/types';
const EmptyArt = () => <svg className="empty-art" width="140" height="108" viewBox="0 0 140 108" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="61" cy="46" r="45" fill="var(--empty-disc)"/>
  <path d="M41 20h27l12 12v56H41z" fill="var(--bg)" stroke="var(--green)" strokeWidth="1.8"/>
  <path d="M68 20v8a4 4 0 0 0 4 4h8" stroke="var(--green)" strokeWidth="1.8"/>
  <path d="M51 42h13M51 51h20M51 60h20" stroke="var(--green)" strokeWidth="1.8"/>
  <path d="M91 86c4-14 9-28 22-45" stroke="var(--leaf)" strokeWidth="1.5"/>
  <path d="M94 74c-5-6-5-12-2-16 4 4 5 10 2 16z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M97 68c3-7 9-10 15-9-2 6-8 9-15 9z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M101 58c-4-7-3-13 1-17 3 5 3 11-1 17z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M105 52c3-7 9-9 15-8-2 6-8 8-15 8z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M109 45c-3-6-2-12 3-15 2 5 1 11-3 15z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M112 41c3-5 8-7 13-6-2 5-7 7-13 6z" fill="var(--leaf-fill)" stroke="var(--leaf)" strokeWidth="1.3"/>
  <path d="M0 88c22-9 45-10 70-3s46 6 68-2v25H0z" fill="var(--bg)"/>
  <path d="M2 88c22-9 45-10 68-3s46 6 66-2M18 96c18-7 38-7 58-1s38 6 58 3M40 104c20-5 40-5 60 0s24 3 34 1" stroke="var(--field)" strokeWidth="1.2"/>
</svg>;
export default function LoanTable({ loans, admin, onEdit, onCompliance, busy, filtered, emptyTitle, emptyText }: { loans: Loan[]; admin: boolean; onEdit: (loan: Loan) => void; onCompliance: (loan: Loan) => void; busy: string; filtered: boolean; emptyTitle: string; emptyText: string }) {
  if (!loans.length) return <div className="empty-state">{filtered ? <div className="empty-icon"><FileText size={27} strokeWidth={1.5}/></div> : <EmptyArt/>}<h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return <ul className="loan-list">{loans.map(loan => <li key={loan.id} className={`loan-card ${loan.status === 'pending' && loan.remarks ? 'has-alert' : ''}`}>
    <button type="button" className="loan-card-open" onClick={() => onEdit(loan)} aria-label={`Open ${loan.atsId}`}/>
    <div className="loan-line">
      {admin ? <span className="loan-branch" title={loan.branchName}>{branchCode(loan.branchName)}</span> : null}
      <strong className="ats" title={`${loan.atsId} · added ${dateLabel(loan.createdAt)}`}>{/^ats\b/i.test(loan.atsId) ? <><span className="ats-tag">ATS</span>{loan.atsId.replace(/^ats[\s-]*/i, '')}</> : loan.atsId}</strong>
      {loan.borrowerName ? <span className="borrower" title={loan.borrowerName}>{loan.borrowerName}</span> : null}
      <span className="amount" title={rupees(loan.amountPaise)}>{lakhs(loan.amountPaise)}</span>
      <span className={`status ${loan.status}`} title={loan.status === 'pending' ? 'Pending' : 'Sanctioned'}><span/><span className="status-text">{loan.status === 'pending' ? 'Pending' : 'Sanctioned'}</span></span>
      <span className="row-action"><button type="button" className={admin ? 'text-button review-button' : 'icon-button'} onClick={() => onEdit(loan)} aria-label={admin ? `Review ${loan.atsId}` : loan.status === 'sanctioned' ? `View ${loan.atsId}` : `Edit ${loan.atsId}`}>{admin ? <>Review <ArrowUpRight size={14}/></> : loan.status === 'sanctioned' ? <Eye size={15}/> : <Pencil size={15}/>}</button></span>
    </div>
    {loan.status === 'pending' && loan.remarks ? <div className={`loan-alert ${loan.compliance === 'complied' ? 'complied' : 'awaiting'}`}>
      <span className="remarks"><span className="sr-only">Admin remarks: </span>{loan.remarks}</span>
      <span className="compliance"><span className={loan.compliance === 'complied' ? 'complied-text' : 'awaiting-text'}>{loan.compliance === 'complied' ? <Check size={13}/> : <CircleDashed size={13}/>} {loan.compliance === 'complied' ? 'Complied' : 'Awaiting'}</span>{!admin ? <button className="text-button" disabled={busy === loan.id} onClick={() => onCompliance(loan)}>{busy === loan.id ? 'Saving…' : loan.compliance === 'complied' ? 'Reopen' : 'Mark complied'}</button> : null}</span>
    </div> : null}
  </li>)}</ul>;
}
