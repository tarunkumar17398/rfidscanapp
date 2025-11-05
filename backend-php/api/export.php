<?php
require_once '../config.php';

$db = getDB();

try {
    // Get last finished cycle
    $cycleStmt = $db->query("
        SELECT id, started_at, finished_at 
        FROM cycles 
        WHERE status = 'finished' 
        ORDER BY finished_at DESC 
        LIMIT 1
    ");
    $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycle) {
        http_response_code(400);
        echo json_encode(['error' => 'No finished cycle available']);
        exit;
    }

    // Set CSV headers
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="inventory-report-' . date('Y-m-d') . '.csv"');

    $output = fopen('php://output', 'w');

    // Report header
    fputcsv($output, ['Inventory Scan Report']);
    fputcsv($output, ['Date', date('Y-m-d H:i:s', strtotime($cycle['finished_at']))]);
    fputcsv($output, []);

    // Summary by category
    fputcsv($output, ['Category Summary']);
    fputcsv($output, ['Category', 'Total', 'Scanned', 'Missing']);

    $categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];
    foreach ($categories as $category) {
        $totalStmt = $db->prepare("SELECT COUNT(*) as total FROM inventory WHERE category = ?");
        $totalStmt->execute([$category]);
        $total = $totalStmt->fetch(PDO::FETCH_ASSOC)['total'];

        $scannedStmt = $db->prepare("
            SELECT COUNT(DISTINCT s.tag_id) as scanned 
            FROM scans s 
            JOIN inventory i ON s.tag_id = i.tag_id 
            WHERE i.category = ? AND s.scanned_at BETWEEN ? AND ?
        ");
        $scannedStmt->execute([$category, $cycle['started_at'], $cycle['finished_at']]);
        $scanned = $scannedStmt->fetch(PDO::FETCH_ASSOC)['scanned'];

        fputcsv($output, [$category, $total, $scanned, $total - $scanned]);
    }

    fputcsv($output, []);

    // Missing items by category
    fputcsv($output, ['Missing Items']);
    fputcsv($output, ['Category', 'Item Code', 'Particulars', 'Size', 'Weight', 'Tag ID']);

    foreach ($categories as $category) {
        $stmt = $db->prepare("
            SELECT item_code, particulars, size, weight, tag_id
            FROM inventory
            WHERE category = ? AND tag_id NOT IN (
                SELECT DISTINCT tag_id 
                FROM scans 
                WHERE scanned_at BETWEEN ? AND ?
            )
        ");
        $stmt->execute([$category, $cycle['started_at'], $cycle['finished_at']]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($items as $item) {
            fputcsv($output, [
                $category,
                $item['item_code'],
                $item['particulars'],
                $item['size'],
                $item['weight'],
                $item['tag_id']
            ]);
        }
    }

    fputcsv($output, []);

    // All scanned items
    fputcsv($output, ['Scanned Items']);
    fputcsv($output, ['Time', 'Tag ID', 'Item Code', 'Category']);

    $scansStmt = $db->prepare("
        SELECT s.scanned_at, s.tag_id, s.item_code, s.category
        FROM scans s
        WHERE s.scanned_at BETWEEN ? AND ?
        ORDER BY s.scanned_at
    ");
    $scansStmt->execute([$cycle['started_at'], $cycle['finished_at']]);
    $scans = $scansStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($scans as $scan) {
        fputcsv($output, [
            $scan['scanned_at'],
            $scan['tag_id'],
            $scan['item_code'],
            $scan['category']
        ]);
    }

    fclose($output);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Export failed']);
}
?>
