export interface InventoryItem {
  'ITEM CODE': string;
  'PARTICULARS': string;
  'SIZE': string;
  'Weight': string;
  'RFID-EPC': string;
}

export interface APIResponse {
  success: boolean;
  count: number;
  data: InventoryItem[];
}

export const fetchInventoryFromAPI = async (): Promise<InventoryItem[]> => {
  console.log('=== FETCHING FROM CK INVENTORY API (WITH PAGINATION) ===');
  const baseUrl = "https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export";
  
  const allItems: InventoryItem[] = [];
  let offset = 0;
  const limit = 1000; // Fetch in batches of 1000
  let hasMore = true;
  
  while (hasMore) {
    const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
    console.log(`Fetching batch: offset=${offset}, limit=${limit}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    const batchItems = result.data || [];
    
    console.log(`  ✓ Received ${batchItems.length} items in this batch`);
    
    if (batchItems.length === 0) {
      hasMore = false;
      console.log('  → No more items, pagination complete');
    } else {
      allItems.push(...batchItems);
      offset += limit;
      
      // If we got fewer items than the limit, we've reached the end
      if (batchItems.length < limit) {
        hasMore = false;
        console.log(`  → Last batch (${batchItems.length} < ${limit}), pagination complete`);
      } else {
        console.log(`  → More items available, continuing... (total so far: ${allItems.length})`);
      }
    }
  }
  
  console.log(`=== PAGINATION COMPLETE: ${allItems.length} total items fetched ===`);
  
  return allItems;
};
