<?php
require_once '../config.php';

$db = getDB();

try {
    // Get all cycles, ordered by most recent first
    $stmt = $db->query("
        SELECT id, status, started_at, finished_at
        FROM cycles
        ORDER BY started_at DESC
    ");
    $cycles = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['cycles' => $cycles]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch cycles']);
}
?>