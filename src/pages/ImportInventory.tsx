import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { fetchInventoryFromAPI, InventoryItem } from '@/services/inventoryApi';
import { ArrowLeft, Upload, Cloud } from 'lucide-react';

const CATEGORIES = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

const CATEGORY_CODES: Record<string, string> = {
  'Brass': 'BR',
  'Iron': 'IR',
  'Wood': 'WD',
  'Tanjore Paintings': 'TP',
};

const ImportInventory = () => {
  const [uploading, setUploading] = useState<string | null>(null);
  const [fetchingAPI, setFetchingAPI] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleFileUpload = async (category: string, file: File | undefined) => {
    if (!file) return;

    setUploading(category);
    try {
      const result = await api.importInventory(category, file);
      if (result.success) {
        toast({
          title: 'Success',
          description: `${category} inventory imported successfully`,
        });
      } else {
        throw new Error(result.message || 'Import failed');
      }
    } catch (error: any) {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import inventory',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleFetchFromAPI = async () => {
    setFetchingAPI(true);
    try {
      const items = await fetchInventoryFromAPI();
      
      // Group items by category based on ITEM CODE prefix (characters 2-4, after "CK")
      const itemsByCategory: Record<string, InventoryItem[]> = {
        'Brass': [],
        'Iron': [],
        'Wood': [],
        'Tanjore Paintings': [],
      };

      items.forEach(item => {
        const itemCode = item['ITEM CODE'];
        if (!itemCode || itemCode.length < 4) {
          console.warn('Item with invalid code:', item);
          return;
        }
        
        // Extract the category code (characters 2-4, after "CK")
        const code = itemCode.substring(2, 4).toUpperCase();
        
        // Match with category codes
        for (const [category, prefix] of Object.entries(CATEGORY_CODES)) {
          if (code === prefix) {
            itemsByCategory[category].push(item);
            break;
          }
        }
      });

      console.log('Items grouped by category:', {
        Brass: itemsByCategory['Brass'].length,
        Iron: itemsByCategory['Iron'].length,
        Wood: itemsByCategory['Wood'].length,
        'Tanjore Paintings': itemsByCategory['Tanjore Paintings'].length,
        Total: items.length
      });

      // Insert items into database for each category
      let totalInserted = 0;
      for (const [category, categoryItems] of Object.entries(itemsByCategory)) {
        console.log(`Processing category ${category}: ${categoryItems.length} items`);
        if (categoryItems.length === 0) continue;

        // First, delete ALL existing items for this category to avoid duplicates
        console.log(`Deleting existing ${category} items...`);
        const { error: deleteError } = await supabase
          .from('inventory')
          .delete()
          .eq('category', category);

        if (deleteError) {
          console.error(`Error deleting ${category}:`, deleteError);
          throw deleteError;
        }

        // Prepare all items for insertion
        const inventoryData = categoryItems.map(item => {
          const hasRfid = Boolean(item['RFID-EPC']?.trim());
          return {
            category,
            item_code: item['ITEM CODE'],
            particulars: item['PARTICULARS'],
            size: item['SIZE'],
            weight: item['Weight'],
            tag_id: hasRfid ? item['RFID-EPC'] : null,
            has_rfid_tag: hasRfid,
          };
        });

        // Insert all new items in batches of 1000 (Supabase limit)
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < inventoryData.length; i += BATCH_SIZE) {
          const batch = inventoryData.slice(i, i + BATCH_SIZE);
          console.log(`Inserting batch ${Math.floor(i / BATCH_SIZE) + 1} for ${category}: ${batch.length} items`);
          
          const { error } = await supabase
            .from('inventory')
            .insert(batch);

          if (error) {
            console.error(`Error inserting ${category} batch:`, error);
            throw error;
          }
          
          console.log(`Successfully inserted ${batch.length} items in batch`);
          totalInserted += batch.length;
        }
        
        console.log(`Completed ${category}: ${categoryItems.length} items`);
      }

      // Count items with and without RFID tags
      const itemsWithRfid = items.filter(item => Boolean(item['RFID-EPC']?.trim())).length;
      const itemsWithoutRfid = items.length - itemsWithRfid;

      setLastSyncTime(new Date());
      toast({
        title: 'Success',
        description: `Fetched ${totalInserted} items (${itemsWithRfid} with RFID, ${itemsWithoutRfid} without)`,
      });
    } catch (error: any) {
      console.error('API fetch error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch from API. Please use CSV import instead.',
        variant: 'destructive',
      });
    } finally {
      setFetchingAPI(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="h-10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl sm:text-3xl font-bold">Import Inventory</h1>
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Fetch from CK Inventory
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Import all in-stock items directly from the CK Inventory system
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
            <Button 
              onClick={handleFetchFromAPI} 
              disabled={fetchingAPI}
              className="w-full sm:w-auto"
              size="sm"
            >
              {fetchingAPI ? "Fetching..." : "Fetch from CK Inventory"}
            </Button>
            {lastSyncTime && (
              <p className="text-xs text-muted-foreground">
                Last synced: {lastSyncTime.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {CATEGORIES.map((category) => (
            <Card key={category}>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">{category}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Upload CSV file to replace existing items</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-3">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(category, e.target.files?.[0])}
                    disabled={uploading === category}
                    className="text-xs sm:text-sm h-10 sm:h-9"
                  />
                  {uploading === category && (
                    <p className="text-xs sm:text-sm text-muted-foreground flex items-center">
                      <Upload className="mr-2 h-4 w-4 animate-pulse" />
                      Uploading...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-muted">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">CSV Format Requirements</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <p className="text-xs sm:text-sm text-muted-foreground">
              CSV files must contain the following columns:
            </p>
            <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground mt-2 space-y-1">
              <li>ITEM CODE</li>
              <li>PARTICULARS</li>
              <li>SIZE</li>
              <li>Weight</li>
              <li>TAG ID (RFID)</li>
            </ul>
            <p className="text-xs sm:text-sm text-destructive mt-3 font-medium">
              ⚠️ Warning: Uploading a new file will replace all existing items for that category.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportInventory;
