import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { decodeHtmlEntities } from '@/lib/utils';
import { ArrowLeft, RefreshCw, Tag, Tags } from 'lucide-react';

interface MissingItem {
  itemCode: string;
  particulars: string;
  size: string;
  weight: string;
  tagId: string | null;
}

interface MissingByCategory {
  category: string;
  count: number;
  countWithRfid: number;
  countWithoutRfid: number;
  itemsWithRfid: MissingItem[];
  itemsWithoutRfid: MissingItem[];
}

const MissingItems = () => {
  const [missingData, setMissingData] = useState<MissingByCategory[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'without-rfid' | 'with-rfid'>('without-rfid');
  const navigate = useNavigate();

  useEffect(() => {
    fetchMissingItems();
  }, []);

  const fetchMissingItems = async () => {
    try {
      setIsRefreshing(true);
      const data = await api.getMissingItems();
      setMissingData(data.missing || []);
    } catch (error) {
      console.error('Failed to fetch missing items:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const totalWithRfid = missingData.reduce((sum, cat) => sum + (cat.countWithRfid || 0), 0);
  const totalWithoutRfid = missingData.reduce((sum, cat) => sum + (cat.countWithoutRfid || 0), 0);

  const renderItemCard = (item: MissingItem, idx: number, showTagId: boolean) => (
    <div 
      key={idx} 
      className="p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1 flex-1">
          <p className="font-bold text-base sm:text-lg">{item.itemCode}</p>
          <p className="text-sm sm:text-base text-foreground break-words">{decodeHtmlEntities(item.particulars || '')}</p>
          <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <span>Size: {decodeHtmlEntities(item.size || '-')}</span>
            <span>Weight: {item.weight || '-'}</span>
          </div>
        </div>
        {showTagId && item.tagId && (
          <div className="text-left sm:text-right">
            <p className="text-xs text-muted-foreground">Tag ID</p>
            <p className="font-mono text-xs sm:text-sm break-all">{item.tagId}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="h-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl sm:text-3xl font-bold">Missing Items</h1>
          </div>
          <div className="ml-0 sm:ml-auto flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchMissingItems}
              disabled={isRefreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Card className={`cursor-pointer transition-all ${activeTab === 'without-rfid' ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setActiveTab('without-rfid')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Tags className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Without RFID</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-orange-500">{totalWithoutRfid}</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all ${activeTab === 'with-rfid' ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setActiveTab('with-rfid')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">With RFID (Not Scanned)</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-destructive">{totalWithRfid}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'without-rfid' | 'with-rfid')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="without-rfid" className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              <span className="hidden sm:inline">Without RFID</span>
              <Badge variant="secondary">{totalWithoutRfid}</Badge>
            </TabsTrigger>
            <TabsTrigger value="with-rfid" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">With RFID</span>
              <Badge variant="destructive">{totalWithRfid}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="without-rfid" className="mt-4">
            {missingData.filter(cat => cat.countWithoutRfid > 0).length === 0 ? (
              <Card>
                <CardContent className="p-8 sm:p-12 text-center text-muted-foreground">
                  <Tags className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-base sm:text-lg">All items have RFID tags!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {missingData.filter(cat => cat.countWithoutRfid > 0).map((category) => (
                  <Card key={category.category}>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="flex items-center justify-between text-base sm:text-xl">
                        <span>{category.category}</span>
                        <Badge variant="secondary">{category.countWithoutRfid}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="space-y-3">
                        {category.itemsWithoutRfid.map((item, idx) => 
                          renderItemCard(item, idx, false)
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="with-rfid" className="mt-4">
            {missingData.filter(cat => cat.countWithRfid > 0).length === 0 ? (
              <Card>
                <CardContent className="p-8 sm:p-12 text-center text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-base sm:text-lg">All RFID-tagged items have been scanned!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {missingData.filter(cat => cat.countWithRfid > 0).map((category) => (
                  <Card key={category.category}>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="flex items-center justify-between text-base sm:text-xl">
                        <span>{category.category}</span>
                        <Badge variant="destructive">{category.countWithRfid}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="space-y-3">
                        {category.itemsWithRfid.map((item, idx) => 
                          renderItemCard(item, idx, true)
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MissingItems;
