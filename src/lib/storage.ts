import { Expense, isExpense } from './expenses';
// Implement this boundary with a per-user cloud repository when authentication is added.
export interface ExpenseRepository { list(): Expense[]; save(expenses: Expense[]): void; }
const KEY='kharcha.expenses.v1';
export const localExpenseRepository: ExpenseRepository = {
 list() { const raw=localStorage.getItem(KEY); if (!raw) return []; const parsed=JSON.parse(raw); if(parsed.version!==1 || !Array.isArray(parsed.expenses) || !parsed.expenses.every(isExpense)) throw new Error('Saved data could not be read. Existing data has been preserved.'); return parsed.expenses; },
 save(expenses) { localStorage.setItem(KEY,JSON.stringify({version:1,expenses})); }
};
