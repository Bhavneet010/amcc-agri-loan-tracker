import {AppError} from './validation.ts';
const documents='https://firestore.googleapis.com/v1/projects/loan-tracker-4af27/databases/(default)/documents';
const normalize=(value:string)=>value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ');
const branchCode=(value:string)=>value.match(/^\s*(\d+)/)?.[1];
function decodeValue(value:any):any{
 if('stringValue' in value)return value.stringValue;
 if('integerValue' in value)return Number(value.integerValue);
 if('doubleValue' in value)return value.doubleValue;
 if('booleanValue' in value)return value.booleanValue;
 if('timestampValue' in value)return value.timestampValue;
 if('arrayValue' in value)return (value.arrayValue.values||[]).map(decodeValue);
 if('mapValue' in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decodeValue(item)]));
 return null;
}
function decodeDocument(document:any):Record<string,any>{return {id:document.name.split('/').pop(),...Object.fromEntries(Object.entries(document.fields||{}).map(([key,value])=>[key,decodeValue(value)]))};}
export async function findNirnayCandidates(input:{borrowerName:string;branchName:string;linkedIds:string[]},fetcher:typeof fetch=fetch){
 let response:Response;
 try{response=await fetcher(documents+':runQuery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'loans'}],where:{fieldFilter:{field:{fieldPath:'category'},op:'EQUAL',value:{stringValue:'Agriculture'}}}}}),signal:AbortSignal.timeout(10000)});}
 catch{throw new AppError('Cannot check existing Nirnay applications. Nothing was added; retry shortly.',503);}
 if(!response.ok)throw new AppError('Cannot check existing Nirnay applications. Nothing was added; retry shortly.',503);
 const linked=new Set(input.linkedIds),rows=await response.json();
 return rows.filter((row:any)=>row.document).map((row:any)=>decodeDocument(row.document)).filter((row:any)=>!linked.has(row.id)&&row.isFreshCC!==false&&branchCode(row.branch||'')===branchCode(input.branchName)&&normalize(row.customerName||'')===normalize(input.borrowerName)).map((row:any)=>({id:'nirnay:'+row.id,borrowerName:row.customerName,branchName:row.branch,amountPaise:Math.round(Number(row.amount)*10000000),status:row.status,atsId:null}));
}
export async function readNirnayMatch(id:string,input:{borrowerName:string;branchName:string;amountPaise:number},fetcher:typeof fetch=fetch){
 const response=await fetcher(documents+'/loans/'+encodeURIComponent(id),{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new AppError('The existing Nirnay application cannot be verified. Refresh and retry.',409);
 const row=decodeDocument(await response.json());
 if(row.category!=='Agriculture'||row.isFreshCC===false||!['pending','returned','sanctioned'].includes(row.status)||branchCode(row.branch||'')!==branchCode(input.branchName)||normalize(row.customerName||'')!==normalize(input.borrowerName)||Math.round(Number(row.amount)*10000000)!==input.amountPaise)throw new AppError('The selected application does not have the same branch, borrower and amount. Review the records before linking.',409);
 return {firebaseId:id,status:row.status,returnedDate:row.returnedDate||null,sanctionDate:row.sanctionDate||null,returnReason:row.status==='returned'?(row.remarks?.trim()||'Returned in Nirnay before linkage; no reason recorded.'):'',remarks:row.remarks||'',data:Object.fromEntries(Object.entries(row).filter(([key])=>!['id','customerName','amount','branch','remarks','status','returnedDate','sanctionDate'].includes(key)&&!key.startsWith('_')))};
}
