<?php
require_once '../config.php';

$db = getDB();

try {
    // Get current cycle
    $cycleStmt = $db->query("SELECT id, started_at FROM cycles WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
    $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycle) {
        echo json_encode(['scans' => []]);
        exit;
    }

    // Get scans from current cycle
    $stmt = $db->prepare("
        SELECT 
            s.id,
            DATE_FORMAT(s.scanned_at, '%Y-%m-%d %H:%i:%s') as time,
            s.tag_id as tagId,
            s.item_code as itemCode,
            s.category
        FROM scans s
        WHERE s.scanned_at >= ?
        ORDER BY s.scanned_at DESC
        LIMIT 1000
    ");
    $stmt->execute([$cycle['started_at']]);
    $scans = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['scans' => $scans]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch scans']);
}
?>
