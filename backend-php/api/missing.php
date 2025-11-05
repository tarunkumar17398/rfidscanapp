<?php
require_once '../config.php';

$db = getDB();

try {
    // Get current cycle
    $cycleStmt = $db->query("SELECT id, started_at FROM cycles WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
    $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    $missing = [];
    $categories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

    foreach ($categories as $category) {
        $query = "
            SELECT 
                i.item_code as itemCode,
                i.particulars,
                i.size,
                i.weight,
                i.tag_id as tagId
            FROM inventory i
            WHERE i.category = ?
        ";

        if ($cycle) {
            $query .= " AND i.tag_id NOT IN (
                SELECT DISTINCT tag_id 
                FROM scans 
                WHERE scanned_at >= ?
            )";
            $stmt = $db->prepare($query);
            $stmt->execute([$category, $cycle['started_at']]);
        } else {
            $stmt = $db->prepare($query);
            $stmt->execute([$category]);
        }

        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($items)) {
            $missing[] = [
                'category' => $category,
                'count' => count($items),
                'items' => $items
            ];
        }
    }

    echo json_encode(['missing' => $missing]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch missing items']);
}
?>
