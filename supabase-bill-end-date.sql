-- Add end_date to bills for installment plans and time-limited bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS end_date date;
