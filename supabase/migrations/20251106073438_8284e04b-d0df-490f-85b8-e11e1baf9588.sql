-- Create inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL,
  particulars TEXT,
  size TEXT,
  weight TEXT,
  tag_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create cycles table
CREATE TABLE IF NOT EXISTS public.cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create scans table
CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id TEXT NOT NULL,
  item_code TEXT,
  category TEXT,
  scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cycle_id UUID REFERENCES public.cycles(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_tag_id ON public.inventory(tag_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_scans_tag_id ON public.scans(tag_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON public.scans(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scans_cycle_id ON public.scans(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON public.cycles(status);
CREATE INDEX IF NOT EXISTS idx_cycles_started_at ON public.cycles(started_at);

-- Enable Row Level Security
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for now (we'll add auth later)
-- For inventory table
CREATE POLICY "Allow all operations on inventory" 
ON public.inventory 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- For cycles table
CREATE POLICY "Allow all operations on cycles" 
ON public.cycles 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- For scans table
CREATE POLICY "Allow all operations on scans" 
ON public.scans 
FOR ALL 
USING (true) 
WITH CHECK (true);