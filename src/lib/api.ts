// API layer using Lovable Cloud backend
import { supabase } from '@/integrations/supabase/client';

export const api = {
  // Auth - Simple PIN verification (will be replaced with proper auth later)
  login: async (pin: string) => {
    // For now, accept the PIN (we'll add proper auth in next step)
    if (pin === '612302') {
      return { success: true };
    }
    return { success: false, message: 'Invalid PIN' };
  },

  // Dashboard stats - OPTIMIZED for fast performance
  getStats: async () => {
    try {
      // Get most recent cycle
      const { data: cycles, error: cycleError } = await supabase
        .from('cycles')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1);

      if (cycleError) throw cycleError;

      const cycle = cycles?.[0] || null;
      const categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

      // OPTIMIZATION: Fetch ALL data in parallel with just 2 queries
      const [inventoryResult, scansResult] = await Promise.all([
        // Get all inventory items in one query
        supabase
          .from('inventory')
          .select('tag_id, category'),
        
        // Get all scans for current cycle in one query (if cycle exists)
        cycle ? supabase
          .from('scans')
          .select('tag_id')
          .gte('scanned_at', cycle.started_at) : Promise.resolve({ data: [], error: null })
      ]);

      if (inventoryResult.error) throw inventoryResult.error;
      if (scansResult.error) throw scansResult.error;

      // Build maps for fast lookups
      const inventoryByCategory = new Map<string, Set<string>>();
      
      for (const item of inventoryResult.data || []) {
        if (!inventoryByCategory.has(item.category)) {
          inventoryByCategory.set(item.category, new Set());
        }
        inventoryByCategory.get(item.category)!.add(item.tag_id);
      }

      // Build set of scanned tags for fast lookup
      const scannedTags = new Set(scansResult.data?.map(s => s.tag_id) || []);

      // Calculate stats for each category
      const stats = categories.map(category => {
        const categoryTags = inventoryByCategory.get(category) || new Set();
        const total = categoryTags.size;
        
        // Count how many of this category's tags have been scanned
        let scanned = 0;
        for (const tagId of categoryTags) {
          if (scannedTags.has(tagId)) {
            scanned++;
          }
        }

        return {
          category,
          total,
          scanned,
          missing: total - scanned
        };
      });

      return {
        stats,
        cycle: cycle ? {
          id: cycle.id,
          status: cycle.status,
          started_at: cycle.started_at,
          finished_at: cycle.finished_at
        } : null
      };
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  },

  // Import inventory
  importInventory: async (category: string, file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row
      const dataLines = lines.slice(1);
      
      // Delete existing items in this category
      await supabase.from('inventory').delete().eq('category', category);

      // Parse and insert new items
      const items = dataLines.map(line => {
        const [item_code, particulars, size, weight, tag_id] = line.split(',').map(s => s.trim());
        return { item_code, particulars, size, weight, tag_id, category };
      });

      const { error } = await supabase.from('inventory').insert(items);
      
      if (error) throw error;

      return { success: true, imported: items.length, message: `Successfully imported ${items.length} items` };
    } catch (error) {
      console.error('Error importing inventory:', error);
      throw error;
    }
  },

  // Cycle management
  startCycle: async () => {
    try {
      console.log('Starting new cycle...');
      
      // Close any active cycles
      const { error: updateError } = await supabase
        .from('cycles')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('status', 'active');

      if (updateError) {
        console.error('Error closing active cycles:', updateError);
        throw updateError;
      }

      // Start new cycle
      const { data, error: insertError } = await supabase
        .from('cycles')
        .insert({ status: 'active', started_at: new Date().toISOString() })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting new cycle:', insertError);
        throw insertError;
      }

      console.log('New cycle created:', data);
      return { success: true, message: 'New cycle started' };
    } catch (error) {
      console.error('Error starting cycle:', error);
      throw error;
    }
  },

  finishCycle: async () => {
    try {
      const { error } = await supabase
        .from('cycles')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('status', 'active');

      if (error) throw error;

      return { success: true, message: 'Cycle finished' };
    } catch (error) {
      console.error('Error finishing cycle:', error);
      throw error;
    }
  },

  // Live scans
  getLiveScans: async () => {
    try {
      // Get most recent cycle
      const { data: cycles } = await supabase
        .from('cycles')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1);

      const cycle = cycles?.[0];
      
      if (!cycle) {
        return { scans: [] };
      }

      // Get scans from current cycle
      const { data: scans, error } = await supabase
        .from('scans')
        .select('*')
        .gte('scanned_at', cycle.started_at)
        .order('scanned_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      return {
        scans: scans?.map(s => ({
          id: s.id,
          time: s.scanned_at,
          tagId: s.tag_id,
          itemCode: s.item_code,
          category: s.category
        })) || []
      };
    } catch (error) {
      console.error('Error fetching live scans:', error);
      throw error;
    }
  },

  // Missing items
  getMissingItems: async () => {
    try {
      // Get current active cycle
      const { data: cycles } = await supabase
        .from('cycles')
        .select('*')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1);

      const cycle = cycles?.[0];
      const categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];
      const missing = [];

      for (const category of categories) {
        // Get all items in category
        const { data: allItems, error: itemsError } = await supabase
          .from('inventory')
          .select('*')
          .eq('category', category);

        if (itemsError) throw itemsError;

        if (!allItems || allItems.length === 0) continue;

        // Get scanned tag_ids
        let scannedTagIds: string[] = [];
        if (cycle) {
          const { data: scans, error: scansError } = await supabase
            .from('scans')
            .select('tag_id')
            .gte('scanned_at', cycle.started_at);

          if (scansError) throw scansError;
          scannedTagIds = scans?.map(s => s.tag_id) || [];
        }

        // Find missing items
        const missingItems = allItems.filter(item => !scannedTagIds.includes(item.tag_id));

        if (missingItems.length > 0) {
          missing.push({
            category,
            count: missingItems.length,
            items: missingItems.map(item => ({
              itemCode: item.item_code,
              particulars: item.particulars,
              size: item.size,
              weight: item.weight,
              tagId: item.tag_id
            }))
          });
        }
      }

      return { missing };
    } catch (error) {
      console.error('Error fetching missing items:', error);
      throw error;
    }
  },

  // Export report - Will be implemented as edge function
  exportReport: async () => {
    // TODO: Implement with edge function
    throw new Error('Export not yet implemented with Cloud backend');
  },

  // Cycles
  getCycles: async () => {
    try {
      const { data: cycles, error } = await supabase
        .from('cycles')
        .select('*')
        .order('started_at', { ascending: false });

      if (error) throw error;

      return { cycles: cycles || [] };
    } catch (error) {
      console.error('Error fetching cycles:', error);
      throw error;
    }
  },

  getReport: async (cycleId: string) => {
    try {
      // Get cycle info
      const { data: cycle, error: cycleError } = await supabase
        .from('cycles')
        .select('*')
        .eq('id', cycleId)
        .single();

      if (cycleError) throw cycleError;

      // Get all inventory items by category
      const { data: inventory, error: invError } = await supabase
        .from('inventory')
        .select('*');

      if (invError) throw invError;

      // Get scans for this cycle
      const { data: scans, error: scansError } = await supabase
        .from('scans')
        .select('*')
        .eq('cycle_id', cycleId)
        .order('scanned_at', { ascending: false });

      if (scansError) throw scansError;

      // Group by category to calculate summary
      const categoryMap = new Map();
      inventory?.forEach((item) => {
        if (!categoryMap.has(item.category)) {
          categoryMap.set(item.category, { total: 0, tagIds: [] });
        }
        const cat = categoryMap.get(item.category);
        cat.total++;
        cat.tagIds.push(item.tag_id);
      });

      const scannedTagIds = new Set(scans?.map(s => s.tag_id) || []);

      const summary = Array.from(categoryMap.entries()).map(([category, data]) => {
        const scanned = data.tagIds.filter((tagId: string) => scannedTagIds.has(tagId)).length;
        return {
          category,
          total: data.total,
          scanned,
          missing: data.total - scanned
        };
      });

      // Get missing items
      const missingItems = inventory?.filter(item => !scannedTagIds.has(item.tag_id)) || [];

      // Get scanned items with details
      const scannedItems = scans?.map(scan => ({
        scanned_at: scan.scanned_at,
        tag_id: scan.tag_id,
        item_code: scan.item_code || '',
        category: scan.category || ''
      })) || [];

      return {
        cycle,
        summary,
        missingItems,
        scannedItems
      };
    } catch (error) {
      console.error('Error fetching report:', error);
      throw error;
    }
  },

  // Batch scan multiple tags at once (optimized)
  batchScan: async (tagIds: string[]) => {
    const { data, error } = await supabase.functions.invoke('batch-scan', {
      body: { tagIds }
    });

    if (error) throw error;
    return data;
  },

  // Scan endpoint (called by RFID scanner)
  scan: async (tagId: string) => {
    console.log('=== API SCAN REQUEST ===');
    console.log('Sending tagId to backend:', tagId);
    
    try {
      // Get current active cycle
      const { data: cycles } = await supabase
        .from('cycles')
        .select('*')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1);

      const cycle = cycles?.[0];

      if (!cycle) {
        return { success: false, message: 'No active cycle' };
      }

      // Check if tag exists in inventory
      const { data: inventoryItem, error: inventoryError } = await supabase
        .from('inventory')
        .select('*')
        .eq('tag_id', tagId)
        .single();

      if (inventoryError || !inventoryItem) {
        return { success: false, message: 'Tag not found in inventory' };
      }

      // Check if already scanned in this cycle
      const { data: existingScan } = await supabase
        .from('scans')
        .select('*')
        .eq('tag_id', tagId)
        .gte('scanned_at', cycle.started_at)
        .single();

      if (existingScan) {
        return { success: false, message: 'Already scanned', duplicate: true };
      }

      // Insert new scan
      const { error: scanError } = await supabase
        .from('scans')
        .insert({
          tag_id: tagId,
          item_code: inventoryItem.item_code,
          category: inventoryItem.category,
          cycle_id: cycle.id,
          scanned_at: new Date().toISOString()
        });

      if (scanError) throw scanError;

      console.log('Scan recorded successfully');
      console.log('======================');

      return {
        success: true,
        message: 'Scan recorded',
        item: {
          itemCode: inventoryItem.item_code,
          category: inventoryItem.category,
          particulars: inventoryItem.particulars
        }
      };
    } catch (error) {
      console.error('API scan error:', error);
      throw error;
    }
  },
};
