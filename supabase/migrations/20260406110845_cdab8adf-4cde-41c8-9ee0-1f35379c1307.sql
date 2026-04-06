ALTER TABLE public.inventory DROP CONSTRAINT inventory_tag_id_key;
CREATE UNIQUE INDEX inventory_tag_id_unique_nonnull ON public.inventory (tag_id) WHERE tag_id IS NOT NULL;