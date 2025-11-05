<?php
require_once '../config.php';

$db = getDB();

try {
    // Get cycle ID from query parameter
    $cycleId = $_GET['cycle_id'] ?? null;
    
    if (!$cycleId) {
        http_response_code(400);
        echo json_encode(['error' => 'Cycle ID required']);
        exit;
    }

    // Get cycle details
    $cycleStmt = $db->prepare("
        SELECT id, status, started_at, finished_at 
        FROM cycles 
        WHERE id = ?
    ");
    $cycleStmt->execute([$cycleId]);
    $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycle) {
        http_response_code(404);
        echo json_encode(['error' => 'Cycle not found']);
        exit;
    }

    // Calculate end time (use finished_at if available, otherwise use NOW)
    $endTime = $cycle['finished_at'] ?? date('Y-m-d H:i:s');

    // Summary by category
    $categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];
    $summary = [];
    
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
        $scannedStmt->execute([$category, $cycle['started_at'], $endTime]);
        $scanned = $scannedStmt->fetch(PDO::FETCH_ASSOC)['scanned'];

        $summary[] = [
            'category' => $category,
            'total' => (int)$total,
            'scanned' => (int)$scanned,
            'missing' => (int)($total - $scanned)
        ];
    }

    // Missing items by category
    $missingItems = [];
    foreach ($categories as $category) {
        $stmt = $db->prepare("
            SELECT item_code, particulars, size, weight, tag_id, category
            FROM inventory
            WHERE category = ? AND tag_id NOT IN (
                SELECT DISTINCT tag_id 
                FROM scans 
                WHERE scanned_at BETWEEN ? AND ?
            )
        ");
        $stmt->execute([$category, $cycle['started_at'], $endTime]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $missingItems = array_merge($missingItems, $items);
    }

    // All scanned items
    $scansStmt = $db->prepare("
        SELECT s.scanned_at, s.tag_id, s.item_code, s.category
        FROM scans s
        WHERE s.scanned_at BETWEEN ? AND ?
        ORDER BY s.scanned_at
    ");
    $scansStmt->execute([$cycle['started_at'], $endTime]);
    $scannedItems = $scansStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'cycle' => $cycle,
        'summary' => $summary,
        'missingItems' => $missingItems,
        'scannedItems' => $scannedItems
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to generate report']);
}
?>