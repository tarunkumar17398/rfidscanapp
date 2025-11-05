import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ArrowLeft, Upload } from 'lucide-react';

const CATEGORIES = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

const ImportInventory = () => {
  const [uploading, setUploading] = useState<string | null>(null);
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Import Inventory</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES.map((category) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
                <CardDescription>Upload CSV file to replace existing items</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(category, e.target.files?.[0])}
                    disabled={uploading === category}
                  />
                  {uploading === category && (
                    <p className="text-sm text-muted-foreground flex items-center">
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
          <CardHeader>
            <CardTitle className="text-lg">CSV Format Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              CSV files must contain the following columns:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
              <li>ITEM CODE</li>
              <li>PARTICULARS</li>
              <li>SIZE</li>
              <li>Weight</li>
              <li>TAG ID (RFID)</li>
            </ul>
            <p className="text-sm text-destructive mt-3">
              ⚠️ Warning: Uploading a new file will replace all existing items for that category.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportInventory;
