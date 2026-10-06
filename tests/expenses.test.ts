import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,totals,isExpense,Expense,localDate} from '../src/lib/expenses';
import {localExpenseRepository} from '../src/lib/storage';
const entry:Expense={id:'1',amountMinor:12550,currency:'NPR',category:'Food',paymentMethod:'Cash',note:'Lunch',date:'2026-10-05',createdAt:'2026-10-05T01:00:00Z',updatedAt:'2026-10-05T01:00:00Z',userId:null};
test('decimal input stores exact minor units and rejects invalid amounts',()=>{assert.equal(parseAmount('125.50'),12550);assert.equal(parseAmount('0.29'),29);for(const value of ['0','-1','1.234','NaN','1e3','Infinity','999999999999999'])assert.throws(()=>parseAmount(value));});
test('totals isolate date, month and currency',()=>{const expenses=[entry,{...entry,id:'2',currency:'USD' as const},{...entry,id:'3',date:'2026-09-30'},{...entry,id:'4',date:'2026-10-01'}];assert.deepEqual(totals(expenses,'2026-10-05','NPR'),{today:12550,month:25100});});
test('local date uses local calendar fields',()=>{assert.equal(localDate(new Date(2026,0,2,23,59)),'2026-01-02');});
test('versioned storage round-trips and preserves corrupted data',()=>{let raw:string|null=null;Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}},configurable:true});assert.deepEqual(localExpenseRepository.list(),[]);localExpenseRepository.save([entry]);assert.deepEqual(localExpenseRepository.list(),[entry]);raw='broken';assert.throws(()=>localExpenseRepository.list());assert.equal(raw,'broken');raw=JSON.stringify({version:1,expenses:[{...entry,amountMinor:'bad'}]});assert.throws(()=>localExpenseRepository.list());assert.equal(isExpense({...entry,currency:'EUR'}),false);});
