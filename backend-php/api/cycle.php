<?php
require_once '../config.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing action']);
    exit;
}

$action = sanitize($data['action']);
$db = getDB();

try {
    if ($action === 'start') {
        // Close any active cycles
        $db->query("UPDATE cycles SET status = 'finished', finished_at = NOW() WHERE status = 'active'");
        
        // Start new cycle
        $db->query("INSERT INTO cycles (status, started_at) VALUES ('active', NOW())");
        
        echo json_encode(['success' => true, 'message' => 'New cycle started']);

    } elseif ($action === 'finish') {
        // Finish active cycle
        $stmt = $db->query("UPDATE cycles SET status = 'finished', finished_at = NOW() WHERE status = 'active'");
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Cycle finished']);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No active cycle']);
        }

    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Cycle operation failed: ' . $e->getMessage()]);
}
?>
