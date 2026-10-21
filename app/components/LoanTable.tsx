'use client';
import { ArrowUpRight, Check, CircleDashed, Eye, FileText } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { branchCode, dateLabel, lakhs, pendingDays, rupees } from '../../lib/types';
const EmptyArt = () => <img className="empty-art" src="/home-empty.png" width="190" height="140" alt="" aria-hidden="true"/>;
export default function LoanTable({ loans, admin, onEdit, onCompliance, busy, filtered, emptyTitle, emptyText }: { loans: Loan[]; admin: boolean; onEdit: (loan: Loan) => void; onCompliance: (loan: Loan) => void; busy: string; filtered: boolean; emptyTitle: string; emptyText: string }) {
  if (!loans.length) return <div className="empty-state">{filtered ? <div className="empty-icon"><FileText size={27} strokeWidth={1.5}/></div> : <EmptyArt/>}<h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return <ul className="loan-list">{loans.map(loan => {
    const daysPending = pendingDays(loan.createdAt);
    return <li key={loan.id} className={`loan-card ${loan.status === 'pending' && loan.remarks ? 'has-alert' : ''}`}>
    <button type="button" className="loan-card-open" onClick={() => onEdit(loan)} aria-label={`Open ${loan.atsId}`}/>
    <div className="loan-line">
      {admin ? <span className="loan-branch" title={loan.branchName}>{branchCode(loan.branchName)}</span> : null}
      <strong className="ats" title={loan.atsId}><span className="ats-number">{/^ats\b/i.test(loan.atsId) ? <><span className="ats-tag">ATS</span>{loan.atsId.replace(/^ats[\s-]*/i, '')}</> : loan.atsId}</span></strong>
      <span className="amount" title={rupees(loan.amountPaise)}>{lakhs(loan.amountPaise)}</span>
      {loan.status === 'pending' ? <span className="pending-circle" aria-label={`${daysPending} ${daysPending === 1 ? 'day' : 'days'} pending`} title={`${daysPending} ${daysPending === 1 ? 'day' : 'days'} pending`}>{daysPending}</span> : <><span className="status sanctioned" title="Sanctioned"><Check size={14} aria-hidden="true"/><span className="status-text">Sanctioned</span></span><span className="row-action"><button type="button" className={admin ? 'text-button review-button' : 'icon-button'} onClick={() => onEdit(loan)} aria-label={admin ? `Review ${loan.atsId}` : `View ${loan.atsId}`}>{admin ? <>Review <ArrowUpRight size={14}/></> : <Eye size={15}/>}</button></span></>}
    </div>
    <div className="loan-meta"><span className="loan-added-date">Added {dateLabel(loan.createdAt)}</span>{loan.borrowerName ? <span className="borrower" title={loan.borrowerName}>{loan.borrowerName}</span> : null}</div>
    {loan.status === 'pending' && loan.remarks ? <div className={`loan-alert ${loan.compliance === 'complied' ? 'complied' : 'awaiting'}`}>
      <span className="remarks"><span className="sr-only">Admin remarks: </span>{loan.remarks}</span>
      <span className="compliance"><span className={loan.compliance === 'complied' ? 'complied-text' : 'awaiting-text'}>{loan.compliance === 'complied' ? <Check size={13}/> : <CircleDashed size={13}/>} {loan.compliance === 'complied' ? 'Complied' : 'Awaiting'}</span>{!admin ? <button className="text-button" disabled={busy === loan.id} onClick={() => onCompliance(loan)}>{busy === loan.id ? 'Saving…' : loan.compliance === 'complied' ? 'Reopen' : 'Mark complied'}</button> : null}</span>
    </div> : null}
  </li>; })}</ul>;
}
