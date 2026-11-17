export interface TableIntent {
  tableId: string;
  mode: 'new' | 'tab';
}

let pending: TableIntent | null = null;

export function setTableIntent(intent: TableIntent): void {
  pending = intent;
}

export function takeTableIntent(): TableIntent | null {
  const value = pending;
  pending = null;
  return value;
}
