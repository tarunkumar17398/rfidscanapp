<?php
require_once '../config.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['tagId']) || empty($data['tagId'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing tagId']);
    exit;
}

$tagId = sanitize($data['tagId']);

if (strlen($tagId) > 100) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Tag ID too long']);
    exit;
}

$db = getDB();

try {
    // Get current active cycle
    $cycleStmt = $db->query("SELECT id FROM cycles WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
    $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycle) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No active cycle']);
        exit;
    }

    // Check if item exists in inventory
    $itemStmt = $db->prepare("SELECT item_code, category FROM inventory WHERE tag_id = ?");
    $itemStmt->execute([$tagId]);
    $item = $itemStmt->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        echo json_encode([
            'success' => false, 
            'message' => 'Tag not found in inventory',
            'tagId' => $tagId
        ]);
        exit;
    }

    // Check if already scanned in this cycle
    $checkStmt = $db->prepare("
        SELECT COUNT(*) as count FROM scans 
        WHERE tag_id = ? AND scanned_at >= (SELECT started_at FROM cycles WHERE id = ?)
    ");
    $checkStmt->execute([$tagId, $cycle['id']]);
    $exists = $checkStmt->fetch(PDO::FETCH_ASSOC)['count'] > 0;

    if ($exists) {
        echo json_encode([
            'success' => true,
            'duplicate' => true,
            'message' => 'Already scanned'
        ]);
        exit;
    }

    // Record scan
    $scanStmt = $db->prepare("INSERT INTO scans (tag_id, item_code, category) VALUES (?, ?, ?)");
    $scanStmt->execute([$tagId, $item['item_code'], $item['category']]);

    echo json_encode([
        'success' => true,
        'item_code' => $item['item_code'],
        'category' => $item['category']
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Scan failed: ' . $e->getMessage()]);
}
?>
