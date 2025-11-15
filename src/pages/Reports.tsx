import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Download, FileText, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '@/lib/api';

interface Cycle {
  id: string; // Changed from number to string (UUID)
  status: string;
  started_at: string;
  finished_at: string | null;
}

interface ReportData {
  cycle: Cycle;
  summary: Array<{
    category: string;
    total: number;
    scanned: number;
    missing: number;
  }>;
  missingItems: Array<{
    category: string;
    item_code: string;
    particulars: string;
    size: string;
    weight: string;
    tag_id: string;
  }>;
  scannedItems: Array<{
    scanned_at: string;
    tag_id: string;
    item_code: string;
    category: string;
  }>;
}

const Reports = () => {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchCycles();
  }, []);

  const fetchCycles = async () => {
    try {
      const data = await api.getCycles();
      setCycles(data.cycles || []);
    } catch (error) {
      console.error('Failed to fetch cycles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load cycles',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (cycleId: string, action: 'download' | 'view' = 'download') => {
    try {
      toast({
        title: 'Generating PDF...',
        description: 'Please wait',
      });

      const data: ReportData = await api.getReport(cycleId);

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // Title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RFID Inventory Scan Report', pageWidth / 2, 20, { align: 'center' });
      
      // Cycle Info
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Cycle #${data.cycle.id} - ${data.cycle.status.toUpperCase()}`, 14, 30);
      pdf.text(`Started: ${new Date(data.cycle.started_at).toLocaleString('en-IN')}`, 14, 36);
      if (data.cycle.finished_at) {
        pdf.text(`Finished: ${new Date(data.cycle.finished_at).toLocaleString('en-IN')}`, 14, 42);
      }

      // Category Summary (Cycle Results)
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Cycle Results - Category Summary', 14, 54);
      
      autoTable(pdf, {
        startY: 58,
        head: [['Category', 'Total', 'Scanned', 'Missing']],
        body: data.summary.map(s => [s.category, s.total, s.scanned, s.missing]),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
      });

      // Missing Items
      const finalY = (pdf as any).lastAutoTable.finalY || 58;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Missing Items Details', 14, finalY + 10);

      if (data.missingItems.length > 0) {
        autoTable(pdf, {
          startY: finalY + 14,
          head: [['Category', 'Item Code', 'Particulars', 'Size', 'Weight', 'Tag ID']],
          body: data.missingItems.map(item => [
            item.category,
            item.item_code,
            item.particulars || '-',
            item.size || '-',
            item.weight || '-',
            item.tag_id
          ]),
          theme: 'grid',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 8 },
        });
      } else {
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.text('✓ No missing items - All inventory accounted for!', 14, finalY + 18);
      }

      // Handle download or view
      if (action === 'download') {
        pdf.save(`inventory-report-cycle-${cycleId}-${new Date().toISOString().split('T')[0]}.pdf`);
        toast({
          title: 'Success',
          description: 'PDF report downloaded',
        });
      } else {
        // Open PDF in new tab
        const pdfBlob = pdf.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        toast({
          title: 'Success',
          description: 'PDF opened in new tab',
        });
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF report',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-4 flex items-center justify-center">
        <p className="text-muted-foreground">Loading cycles...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Cycle Reports</h1>
            <p className="text-sm text-muted-foreground">Download PDF reports for completed cycles</p>
          </div>
        </div>

        <div className="space-y-3">
          {cycles.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No cycles found
              </CardContent>
            </Card>
          ) : (
            cycles.map((cycle) => (
              <Card key={cycle.id} className="hover:bg-accent/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base sm:text-lg">
                          Cycle #{cycle.id}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            cycle.status === 'active' 
                              ? 'bg-secondary text-secondary-foreground' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {cycle.status === 'active' ? '● Active' : '● Finished'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => generatePDF(cycle.id, 'view')}
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={cycle.status === 'active'}
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                      <Button
                        onClick={() => generatePDF(cycle.id, 'download')}
                        size="sm"
                        className="gap-2"
                        disabled={cycle.status === 'active'}
                      >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Download</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                    <p>Started: {formatDate(cycle.started_at)}</p>
                    {cycle.finished_at && (
                      <p>Finished: {formatDate(cycle.finished_at)}</p>
                    )}
                    {cycle.status === 'active' && (
                      <p className="text-amber-600 dark:text-amber-500 font-medium mt-2">
                        ⚠️ Complete this cycle to download report
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
