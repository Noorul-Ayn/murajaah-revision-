-- Three more practice modes: where on the page (place), from the meaning
-- (meaning), and similar ayahs (pair). Widens the checks on reviews so their
-- answers can sync. Safe to run more than once.

alter table public.reviews drop constraint if exists reviews_item_id_check;
alter table public.reviews add constraint reviews_item_id_check check (
  item_id ~ '^(open|name|link):[0-9]{1,3}$'
  or item_id ~ '^(ayah|place|meaning):[0-9]{1,3}:[0-9]{1,3}$'
  or item_id ~ '^pair:[0-9]{1,3}:[0-9]{1,3}:[0-9]{1,3}:[0-9]{1,3}$'
);

alter table public.reviews drop constraint if exists reviews_mode_check;
alter table public.reviews add constraint reviews_mode_check check (
  mode in ('open', 'name', 'link', 'ayah', 'place', 'meaning', 'pair')
);
