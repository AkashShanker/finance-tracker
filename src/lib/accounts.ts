export interface AccountTemplate {
  name: string;
  type: "asset" | "debt";
  sort_order: number;
}

export const DEFAULT_ACCOUNTS: AccountTemplate[] = [
  { name: "Checking", type: "asset", sort_order: 1 },
  { name: "Marcus Emergency", type: "asset", sort_order: 2 },
  { name: "VOO (wife)", type: "asset", sort_order: 3 },
  { name: "401K", type: "asset", sort_order: 4 },
  { name: "Capital One CC", type: "debt", sort_order: 10 },
  { name: "Discover CC (yours)", type: "debt", sort_order: 11 },
  { name: "Citi CC", type: "debt", sort_order: 12 },
  { name: "Discover CC (wife)", type: "debt", sort_order: 13 },
  { name: "Chase Slate (wife)", type: "debt", sort_order: 14 },
  { name: "Chase Freedom (wife)", type: "debt", sort_order: 15 },
  { name: "Apple Card (wife)", type: "debt", sort_order: 16 },
  { name: "Midland (wife)", type: "debt", sort_order: 17 },
  { name: "Toyota", type: "debt", sort_order: 18 },
  { name: "Mazda", type: "debt", sort_order: 19 },
  { name: "Prodigy (wife)", type: "debt", sort_order: 20 },
  { name: "India House", type: "debt", sort_order: 21 },
];
