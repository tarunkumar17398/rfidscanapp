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
      
      // Fetch ALL inventory items in batches if needed
      let allInventory: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('inventory')
          .select('tag_id, category, has_rfid_tag')
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allInventory = allInventory.concat(data);
          from += batchSize;
          
          if (data.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      // Get all scans for current cycle (paginate to handle >1000)
      let allScans: { tag_id: string }[] = [];
      if (cycle) {
        let scanFrom = 0;
        let hasMoreScans = true;
        
        while (hasMoreScans) {
          const { data: scanBatch, error: scanError } = await supabase
            .from('scans')
            .select('tag_id')
            .gte('scanned_at', cycle.started_at)
            .range(scanFrom, scanFrom + batchSize - 1);
          
          if (scanError) throw scanError;
          
          if (scanBatch && scanBatch.length > 0) {
            allScans = allScans.concat(scanBatch);
            scanFrom += batchSize;
            
            if (scanBatch.length < batchSize) {
              hasMoreScans = false;
            }
          } else {
            hasMoreScans = false;
          }
        }
      }

      // Build maps for fast lookups - separate with/without RFID
      const inventoryByCategory = new Map<string, { withRfid: Set<string>, withoutRfid: number }>();
      
      for (const item of allInventory) {
        if (!inventoryByCategory.has(item.category)) {
          inventoryByCategory.set(item.category, { withRfid: new Set(), withoutRfid: 0 });
        }
        const cat = inventoryByCategory.get(item.category)!;
        
        if (item.has_rfid_tag && item.tag_id) {
          cat.withRfid.add(item.tag_id);
        } else {
          cat.withoutRfid++;
        }
      }

      // Build set of scanned tags for fast lookup
      const scannedTags = new Set(allScans.map(s => s.tag_id));

      // Calculate stats for each category
      const stats = categories.map(category => {
        const categoryData = inventoryByCategory.get(category) || { withRfid: new Set(), withoutRfid: 0 };
        const totalWithRfid = categoryData.withRfid.size;
        const totalWithoutRfid = categoryData.withoutRfid;
        
        // Count how many of this category's tags have been scanned
        let scanned = 0;
        for (const tagId of categoryData.withRfid) {
          if (scannedTags.has(tagId)) {
            scanned++;
          }
        }

        return {
          category,
          total: totalWithRfid + totalWithoutRfid,
          totalWithRfid,
          totalWithoutRfid,
          scanned,
          missing: totalWithRfid - scanned
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

      // Parse and insert new items with has_rfid_tag flag
      const items = dataLines.map(line => {
        const [item_code, particulars, size, weight, tag_id] = line.split(',').map(s => s.trim());
        const hasRfid = tag_id && tag_id !== '';
        return { 
          item_code, 
          particulars, 
          size, 
          weight, 
          tag_id: hasRfid ? tag_id : null, 
          has_rfid_tag: hasRfid,
          category 
        };
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
        .limit(25000);

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

      // Fetch ALL scanned tags for current cycle (paginated)
      let scannedTagIds: string[] = [];
      if (cycle) {
        let scanFrom = 0;
        const batchSize = 1000;
        let hasMoreScans = true;
        
        while (hasMoreScans) {
          const { data: scans, error: scansError } = await supabase
            .from('scans')
            .select('tag_id')
            .gte('scanned_at', cycle.started_at)
            .range(scanFrom, scanFrom + batchSize - 1);

          if (scansError) throw scansError;
          
          if (scans && scans.length > 0) {
            scannedTagIds = scannedTagIds.concat(scans.map(s => s.tag_id));
            scanFrom += batchSize;
            if (scans.length < batchSize) hasMoreScans = false;
          } else {
            hasMoreScans = false;
          }
        }
      }

      const scannedTagSet = new Set(scannedTagIds);

      for (const category of categories) {
        // Get all items in category - paginated for large datasets
        let allItems: any[] = [];
        let itemFrom = 0;
        const batchSize = 1000;
        let hasMoreItems = true;
        
        while (hasMoreItems) {
          const { data: itemBatch, error: itemsError } = await supabase
            .from('inventory')
            .select('*')
            .eq('category', category)
            .range(itemFrom, itemFrom + batchSize - 1);

          if (itemsError) throw itemsError;
          
          if (itemBatch && itemBatch.length > 0) {
            allItems = allItems.concat(itemBatch);
            itemFrom += batchSize;
            if (itemBatch.length < batchSize) hasMoreItems = false;
          } else {
            hasMoreItems = false;
          }
        }

        if (!allItems || allItems.length === 0) continue;

        // Separate items with and without RFID tags
        const itemsWithRfid = allItems.filter(item => item.has_rfid_tag && item.tag_id);
        const itemsWithoutRfid = allItems.filter(item => !item.has_rfid_tag || !item.tag_id);

        // Find missing items (only from those with RFID tags)
        const missingWithRfid = itemsWithRfid.filter(item => !scannedTagSet.has(item.tag_id));

        if (missingWithRfid.length > 0 || itemsWithoutRfid.length > 0) {
          missing.push({
            category,
            count: missingWithRfid.length + itemsWithoutRfid.length,
            countWithRfid: missingWithRfid.length,
            countWithoutRfid: itemsWithoutRfid.length,
            itemsWithRfid: missingWithRfid.map(item => ({
              itemCode: item.item_code,
              particulars: item.particulars,
              size: item.size,
              weight: item.weight,
              tagId: item.tag_id
            })),
            itemsWithoutRfid: itemsWithoutRfid.map(item => ({
              itemCode: item.item_code,
              particulars: item.particulars,
              size: item.size,
              weight: item.weight,
              tagId: null
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

      // Get all inventory items by category - use range() for more than 1000 items
      const { data: inventory, error: invError } = await supabase
        .from('inventory')
        .select('*')
        .range(0, 9999);

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
  // Load all RFID-tagged inventory into memory for instant local lookup
  getTagMap: async (): Promise<Record<string, { category: string; particulars: string; itemCode: string }>> => {
    try {
      let allItems: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('inventory')
          .select('tag_id, category, particulars, item_code')
          .eq('has_rfid_tag', true)
          .not('tag_id', 'is', null)
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allItems = allItems.concat(data);
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const tagMap: Record<string, { category: string; particulars: string; itemCode: string }> = {};
      for (const item of allItems) {
        if (item.tag_id) {
          tagMap[item.tag_id] = {
            category: item.category || 'Unknown',
            particulars: item.particulars || '',
            itemCode: item.item_code || '',
          };
        }
      }

      console.log(`✅ Tag map loaded: ${Object.keys(tagMap).length} items`);
      return tagMap;
    } catch (error) {
      console.error('Failed to load tag map:', error);
      return {};
    }
  },
};
