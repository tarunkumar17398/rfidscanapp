<?php
require_once '../config.php';

$db = getDB();

// Get most recent cycle (active or finished)
$cycleStmt = $db->query("SELECT id, started_at FROM cycles ORDER BY started_at DESC LIMIT 1");
$cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

$stats = [];
$categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

foreach ($categories as $category) {
    // Total items in this category
    $totalStmt = $db->prepare("SELECT COUNT(*) as total FROM inventory WHERE category = ?");
    $totalStmt->execute([$category]);
    $total = $totalStmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Scanned items in current cycle
    $scanned = 0;
    if ($cycle) {
        $scannedStmt = $db->prepare("
            SELECT COUNT(DISTINCT s.tag_id) as scanned 
            FROM scans s 
            JOIN inventory i ON s.tag_id = i.tag_id 
            WHERE i.category = ? AND s.scanned_at >= (SELECT started_at FROM cycles WHERE id = ?)
        ");
        $scannedStmt->execute([$category, $cycle['id']]);
        $scanned = $scannedStmt->fetch(PDO::FETCH_ASSOC)['scanned'];
    }

    $stats[] = [
        'category' => $category,
        'total' => (int)$total,
        'scanned' => (int)$scanned,
        'missing' => (int)($total - $scanned)
    ];
}

echo json_encode(['stats' => $stats]);
?>
