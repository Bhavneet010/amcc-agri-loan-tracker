'use client';
import { ArrowUpRight, Check, CircleDashed, FileText, Pencil } from 'lucide-react';
import type { Loan } from '../../lib/types';
import { dateLabel, rupees } from '../../lib/types';
export default function LoanTable({ loans, admin, onEdit, onCompliance, busy, filtered }: { loans: Loan[]; admin: boolean; onEdit: (loan: Loan) => void; onCompliance: (loan: Loan) => void; busy: string; filtered: boolean }) {
  if (!loans.length) return <div className="empty-state"><div className="empty-icon"><FileText size={27} strokeWidth={1.5}/></div><h3>{filtered ? 'No matching loans' : 'A fresh start for your branch'}</h3><p>{filtered ? 'Try another ATS number or clear the filters.' : 'Add your first application to start tracking its progress.'}</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Application / ATS ID</th>{admin ? <th>Branch</th> : null}<th>Amount</th><th>Status</th><th>Admin remarks</th><th>Compliance</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{loans.map(loan => <tr key={loan.id}>
    <td data-label="Application"><strong className="ats">{loan.atsId}</strong><span className="row-date">Added {dateLabel(loan.createdAt)}</span></td>
    {admin ? <td data-label="Branch">{loan.branchName}</td> : null}
    <td data-label="Amount" className="amount">{rupees(loan.amountPaise)}</td>
    <td data-label="Status"><span className={`status ${loan.status}`}><span/>{loan.status === 'pending' ? 'Pending' : 'Sanctioned'}</span></td>
    <td data-label="Admin remarks" className="remarks">{loan.remarks || <span className="muted">No remarks</span>}</td>
    <td data-label="Compliance">{loan.remarks ? <div className="compliance"><span className={loan.compliance === 'complied' ? 'complied-text' : 'awaiting-text'}>{loan.compliance === 'complied' ? <Check size={14}/> : <CircleDashed size={14}/>} {loan.compliance === 'complied' ? 'Complied' : 'Awaiting'}</span>{!admin ? <button className="text-button" disabled={busy === loan.id} onClick={() => onCompliance(loan)}>{busy === loan.id ? 'Saving…' : loan.compliance === 'complied' ? 'Reopen' : 'Mark complied'}</button> : null}</div> : <span className="muted">—</span>}</td>
    <td className="row-action">{admin || loan.status === 'pending' ? <button className={admin ? 'text-button review-button' : 'icon-button'} onClick={() => onEdit(loan)} aria-label={admin ? `Review ${loan.atsId}` : `Edit ${loan.atsId}`}>{admin ? <>Review <ArrowUpRight size={14}/></> : <Pencil size={16}/>}</button> : null}</td>
  </tr>)}</tbody></table></div>;
}
