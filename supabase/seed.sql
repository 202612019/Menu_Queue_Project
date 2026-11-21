-- OPTIONAL DEMO DATA copied from src/content/foodItems.js for Phase 4.
-- Re-running adds missing sample names and preserves existing prices and availability.
-- Run as the project database owner after the migration. No users or orders are seeded.
begin;

with sample_categories(name) as (
  values
  ('Breakfast'),
  ('Snacks'),
  ('Meals'),
  ('Beverages'),
  ('Desserts')
)
insert into public.categories (name, description)
select name, 'Demo menu category for College Canteen' from sample_categories
on conflict ((lower(btrim(name)))) do nothing;

with sample_items(category_name, name, description, price, image_url, is_available) as (
  values
  ('Breakfast', 'Veg Sandwich', 'Toasted bread, crunchy vegetables, and a little green chutney.', 45.00, '/images/menu/veg-sandwich.jpg', true),
  ('Breakfast', 'Masala Dosa', 'A golden, crisp dosa with potato masala, sambar, and chutney.', 60.00, '/images/menu/masala-dosa.jpg', true),
  ('Snacks', 'Veg Burger', 'A crispy vegetable patty with fresh lettuce in a soft bun.', 65.00, '/images/menu/veg-burger.jpg', false),
  ('Snacks', 'Samosa', 'Flaky pastry filled with spiced potatoes. A classic break-time bite.', 20.00, '/images/menu/samosa.jpg', true),
  ('Meals', 'Paneer Rice Bowl', 'Soft paneer in a comforting curry, paired with a serving of rice.', 90.00, '/images/menu/paneer-rice.jpg', true),
  ('Beverages', 'Cold Coffee', 'Smooth, chilled coffee with milk and a swirl of chocolate.', 50.00, '/images/menu/cold-coffee.jpg', true),
  ('Beverages', 'Fresh Lime Soda', 'A refreshing citrus cooler with lime, mint, and a little fizz.', 35.00, '/images/menu/lime-soda.jpg', true),
  ('Desserts', 'Gulab Jamun', 'Two soft, syrup-soaked sweets for a happy finish to your meal.', 30.00, '/images/menu/gulab-jamun.jpg', true)
)
insert into public.menu_items (category_id, name, description, price, image_url, is_available)
select c.id, s.name, s.description, s.price, s.image_url, s.is_available
from sample_items s
join public.categories c on lower(btrim(c.name)) = lower(btrim(s.category_name))
where not exists (
  select 1 from public.menu_items existing where lower(btrim(existing.name)) = lower(btrim(s.name))
)
on conflict (category_id, (lower(btrim(name)))) do nothing;

commit;
