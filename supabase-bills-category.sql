-- Migration: Add "Bills" expense category to all existing households
-- Run in Supabase SQL Editor

insert into categories (household_id, name, type, icon)
select id, 'Bills', 'expense', '🧾'
from households
where id not in (
  select household_id from categories where name = 'Bills' and type = 'expense'
);
