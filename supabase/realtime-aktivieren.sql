-- Live-Synchronisation für alle Listen einschalten.
-- Stand 15.11.2026 war Realtime nur für packages, wishlist und budget_entries aktiv.
-- Einkaufsliste, To-Do, Notizen, Essensplan, Ämtli und Countdowns kamen beim anderen
-- erst nach dem Neuladen an. Dieses Skript ist gefahrlos mehrfach ausführbar.
do $$
declare t text;
begin
  foreach t in array array['shopping_items','todos','notes','food_plan','chores','countdowns','packages','wishlist','budget_entries'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
