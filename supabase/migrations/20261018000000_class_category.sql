alter table public."Class"
  add column if not exists category text;

alter table public."Class"
  add constraint "Class_category_not_blank"
  check (category is null or btrim(category) <> '');
