-- Allow NULL values for tag_id to support items without RFID tags
ALTER TABLE public.inventory 
ALTER COLUMN tag_id DROP NOT NULL;

-- Add has_rfid_tag flag to easily identify items with RFID tags
ALTER TABLE public.inventory 
ADD COLUMN has_rfid_tag BOOLEAN NOT NULL DEFAULT false;

-- Update existing records to set has_rfid_tag based on tag_id presence
UPDATE public.inventory 
SET has_rfid_tag = (tag_id IS NOT NULL AND tag_id != '');

-- Create index for better query performance on has_rfid_tag
CREATE INDEX idx_inventory_has_rfid_tag ON public.inventory(has_rfid_tag);