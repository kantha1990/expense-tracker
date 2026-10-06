import { Expense, isExpense, Ledger, isCard, isRecurring } from './expenses';
// Keep this key stable so V1 device data is retained. New writes use schema V2.
const KEY='kharcha.expenses.v1';
export interface ExpenseRepository { list(): Expense[]; save(expenses: Expense[]): void; }
export function readLedger():Ledger {const raw=localStorage.getItem(KEY);if(!raw)return {version:2,expenses:[],cards:[],recurring:[]};let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Saved data could not be read. Existing data has been preserved.');}if(!parsed||![1,2].includes(parsed.version)||!Array.isArray(parsed.expenses))throw new Error('Saved data could not be read. Existing data has been preserved.');
const expenses=parsed.expenses.map((x:Expense)=>x&&typeof x==='object'?{...x,category:(x.category as string)==='Home'?'Household':x.category}:x);
const cards=parsed.version===1?[]:parsed.cards,recurring=parsed.version===1?[]:parsed.recurring;
if(!expenses.every(isExpense)||!Array.isArray(cards)||!cards.every(isCard)||!Array.isArray(recurring)||!recurring.every(isRecurring))throw new Error('Saved data could not be read. Existing data has been preserved.');return {version:2,expenses,cards,recurring};}
export function writeLedger(state:Ledger){if(!state.expenses.every(isExpense)||!state.cards.every(isCard)||!state.recurring.every(isRecurring))throw new Error('Invalid expense data. Nothing was saved.');localStorage.setItem(KEY,JSON.stringify(state));}
export const localExpenseRepository:ExpenseRepository={list:()=>readLedger().expenses,save:expenses=>writeLedger({...readLedger(),expenses})};
